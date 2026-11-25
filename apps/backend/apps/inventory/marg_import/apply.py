"""Write a plan: the catalogue changes, then the outlet's stock. Call inside `transaction.atomic()`."""
import hashlib
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Sum

from apps.inventory import ledger_health, pack_rules
from apps.inventory.models import Batch, MasterProduct, StockAdjustment, StockLedger

from .plan import Plan, products_used_elsewhere
from .rules import money


TAKEOVER_VOUCHER = 'Taken over from Marg'   # the stock ledger screen shows it as "Stock added: stock as on <date>"


class ImportRefused(Exception):
    """The load would be unsafe or its result does not add up. Nothing is kept (the caller's transaction rolls back)."""


def apply_products(plan: Plan) -> dict:
    created = updated = 0
    for pp in plan.products.values():
        if pp.create:
            pack_rules.raise_if_invalid(pp.create['pack_size'], pp.create['pack_unit'], pp.create['pack_type'])
            pp.product = MasterProduct.objects.create(**pp.create)
            created += 1
        elif pp.changes:
            if pp.shared:
                raise ImportRefused(f'{pp.name} is used by another outlet and must not be changed.')
            for f, (_, new) in pp.changes.items():
                setattr(pp.product, f, new)
            pack_rules.raise_if_invalid(pp.product.pack_size, pp.product.pack_unit, pp.product.pack_type)
            pp.product.save(update_fields=list(pp.changes))
            updated += 1
    return {'products_created': created, 'products_updated': updated}


def _batches_documents_point_at(outlet) -> set:
    """Batches of this outlet that a bill, purchase, return, draft... line still refers to. The stock ledger does not count."""
    ids = set()
    for rel in Batch._meta.related_objects:
        if rel.related_model is StockLedger:
            continue
        fk = rel.field.name
        ids.update(rel.related_model._base_manager.filter(**{f'{fk}__outlet': outlet}).values_list(f'{fk}_id', flat=True).distinct())
    return ids


def replace_stock(plan: Plan) -> dict:
    """
    The outlet's stock becomes exactly what the sheet says.

    * The old stock ledger rows of the outlet go. Every new batch gets ONE row bringing in its stock, at its purchase rate,
      dated the day of the sheet, so the batch and its ledger agree from the first moment (docs/STOCK_LEDGER.md). It is an
      `ADJUSTMENT_IN` "taken over from Marg", NOT an `OPENING` row: the P&L adds up OPENING rows as "Opening Stock".
    * Marg's own opening stock (its stock on 1 April, item by item, at Marg's value) is written as `OPENING` rows dated
      1 April with no batch (those batches are long sold). The P&L's opening stock is then Marg's figure.
    * An old batch that a document still points at cannot be deleted (and must not be: the bill would lose its line).
      It is emptied and switched off. The others are deleted.
    """
    outlet = plan.outlet
    if StockAdjustment.objects.filter(outlet=outlet).exists():
        raise ImportRefused('This outlet has stock write-off records (GST reversals). Replacing its stock would delete them.')

    ledger_deleted = StockLedger.objects.filter(outlet=outlet).count()
    StockLedger.objects.filter(outlet=outlet).delete()

    kept = _batches_documents_point_at(outlet)
    old = Batch.objects.filter(outlet=outlet)
    deleted = old.exclude(id__in=kept).count()
    old.exclude(id__in=kept).delete()
    retired = Batch.objects.filter(outlet=outlet, id__in=kept).update(qty_strips=0, qty_loose=0, is_active=False)

    batches, opening = [], []
    for bp in plan.batches:
        product = plan.products[bp.product_key].product
        if product is None:
            raise ImportRefused(f'No catalogue entry for {bp.row.name}: run the product step first.')
        if bp.pack.errors() or not (0 <= bp.loose < max(bp.pack.size, 1)) or bp.packs < 0:
            raise ImportRefused(f'{bp.row.name} / {bp.batch_no}: impossible pack or quantity.')
        qty = bp.packs_decimal
        b = Batch(
            outlet=outlet, product=product, batch_no=bp.batch_no, mfg_date=None, expiry_date=bp.expiry,
            mrp=bp.prices.mrp, purchase_rate=bp.prices.purchase, landing_rate=bp.prices.landing,
            pack_size=bp.pack.size, pack_unit=bp.pack.unit, pack_type=bp.pack.type,
            qty_strips=bp.packs, qty_loose=bp.loose, opening_qty=qty, rack_location=bp.row.rack[:100] or None,
            is_active=True, is_opening_stock=True,
        )
        batches.append(b)
        value = money(qty * bp.prices.purchase)
        opening.append(StockLedger(
            outlet=outlet, product=product, batch=b, txn_type='ADJUSTMENT_IN', txn_date=plan.sheet.as_on,
            voucher_type=TAKEOVER_VOUCHER, voucher_number='MARG', party_name=f'{TAKEOVER_VOUCHER} – stock as on {plan.sheet.as_on:%d-%b-%Y}',
            batch_number=bp.batch_no,
            expiry_date=bp.expiry, qty_in=qty, qty_out=Decimal('0'), rate=bp.prices.purchase,
            value_in=value, value_out=Decimal('0'), running_qty=qty, running_value=value,
        ))
    # One row per batch written in bulk with exactly what services.post_stock_ledger_entry computes for a first row;
    # that function locks and refreshes the cache per call, which 1,500 rows in one transaction do not need.
    for key, qty, value, rate in plan.marg_opening:
        product = plan.products[key].product
        opening.append(StockLedger(
            outlet=outlet, product=product, batch=None, txn_type='OPENING', txn_date=plan.books_start,
            voucher_type='Opening Stock', voucher_number='OPENING', party_name='Marg opening stock', batch_number='',
            expiry_date=None, qty_in=qty, qty_out=Decimal('0'), rate=rate, value_in=money(value), value_out=Decimal('0'),
            running_qty=qty, running_value=money(value),
        ))
    Batch.objects.bulk_create(batches, batch_size=500)
    StockLedger.objects.bulk_create(opening, batch_size=500)

    from apps.inventory.cache_utils import bump_inventory_cache
    transaction.on_commit(lambda: bump_inventory_cache(outlet.id))
    return {'ledger_rows_removed': ledger_deleted, 'old_batches_deleted': deleted, 'old_batches_switched_off': retired,
            'batches_created': len(batches), 'stock_rows_written': len(batches), 'marg_opening_rows': len(plan.marg_opening)}


def verify(plan: Plan) -> dict:
    """Read the result back from the database and compare it with the plan. Any difference refuses the whole load."""
    outlet, want = plan.outlet, plan.totals()
    live = Batch.objects.filter(outlet=outlet, is_active=True)
    got = live.aggregate(n=Count('id'), packs=Sum('qty_strips'), loose=Sum('qty_loose'))
    landing = sum((money(ledger_health.packs(ledger_health.stock_units(b), b.pack_size) * (b.landing_rate or 0)) for b in live), Decimal('0'))
    opening = StockLedger.objects.filter(outlet=outlet, voucher_type=TAKEOVER_VOUCHER).aggregate(n=Count('id'), v=Sum('value_in'))
    marg_open = StockLedger.objects.filter(outlet=outlet, txn_type='OPENING').aggregate(v=Sum('value_in'))['v'] or Decimal('0')
    at_purchase = sum((money(ledger_health.packs(ledger_health.stock_units(b), b.pack_size) * b.purchase_rate) for b in live), Decimal('0'))
    health = ledger_health.scan(outlet)['counts']
    result = {
        'batches': got['n'] or 0, 'whole_packs': got['packs'] or 0, 'loose_units': got['loose'] or 0, 'landing_value': landing,
        'opening_rows': opening['n'] or 0, 'opening_stock_value': opening['v'] or Decimal('0'), 'stock_at_purchase_rate': at_purchase,
        'marg_opening_stock': marg_open,
        'ledger_health': health,
        'batches_with_bad_pack': live.exclude(pack_type__in=pack_rules.PACK_TYPES).count() + live.filter(qty_loose__gte=F('pack_size')).exclude(qty_loose=0).count(),
    }
    problems = [f'{k}: database has {result[k]}, the plan says {want[k]}'
                for k in ('batches', 'whole_packs', 'loose_units', 'landing_value') if result[k] != want[k]]
    if result['opening_rows'] != result['batches']:
        problems.append(f"{result['opening_rows']} stock rows for {result['batches']} batches")
    if result['opening_stock_value'] != result['stock_at_purchase_rate']:
        problems.append(f"stock taken over {result['opening_stock_value']} is not the stock at purchase rate {result['stock_at_purchase_rate']}")
    if marg_open != money(want['marg_opening_stock']):
        problems.append(f"opening stock {marg_open} is not Marg's {want['marg_opening_stock']}")
    bad = {k: v for k, v in health.items() if k != ledger_health.OK and v}
    if bad:
        problems.append(f'the stock ledger does not agree with the batches: {bad}')
    if result['batches_with_bad_pack']:
        problems.append(f"{result['batches_with_bad_pack']} batches with an impossible pack")
    if problems:
        raise ImportRefused('The result does not add up: ' + '; '.join(problems))
    return result


def others_fingerprint(outlet) -> dict:
    """Everything of the OTHER outlets this load could conceivably touch, as numbers. Compared before and after."""
    used = products_used_elsewhere(outlet)
    h = hashlib.sha256()
    fields = ('id', 'name', 'composition', 'manufacturer', 'category', 'drug_type', 'schedule_type', 'hsn_code', 'gst_rate',
              'pack_size', 'pack_unit', 'pack_type', 'barcode', 'mrp', 'is_discontinued')
    for row in MasterProduct.objects.filter(id__in=used).order_by('id').values_list(*fields):
        h.update(repr(row).encode())
    return {
        'batches': Batch.objects.exclude(outlet=outlet).aggregate(n=Count('id'), packs=Sum('qty_strips'), loose=Sum('qty_loose')),
        'stock_ledger_rows': StockLedger.objects.exclude(outlet=outlet).count(),
        'products_in_use': len(used),
        'products_in_use_hash': h.hexdigest(),
    }
