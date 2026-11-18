"""
What the Stock Ledger screen needs, worked out on the server so every screen agrees:

* each movement in plain words (`describe`): "Sold", "Received", "Written off: Expired", "Opening balance recorded"...
  (the screen used to show Type + Voucher + Party that all said the same thing, with the write-off reason squeezed into
  the Party column and cut off);
* quantities with the BATCH's own pack size / type / unit (the ledger row used to carry the PRODUCT's pack size, which is why
  one row showed "-2 strips" next to "0 tablets");
* a card for one batch: identity, expiry, stock now, who supplied it, and whether its ledger is complete.

Cost figures (rate, value) are left out for people without `view_purchase_rates`.
"""
from datetime import date
from decimal import Decimal

from django.db.models import Q

from apps.inventory import ledger_health as lh
from apps.inventory.models import Batch, StockLedger

BOOKKEEPING = (lh.REPAIR_VOUCHER, lh.CORRECTION_VOUCHER)
KNOWN_REMOVALS = {'expired': 'Expired', 'damaged': 'Damaged', 'damage': 'Damaged', 'destroyed': 'Destroyed', 'theft_loss': 'Theft or loss'}


def is_bookkeeping(e) -> bool:
    return e.voucher_type in BOOKKEEPING


def _split_reason(party_name: str):
    """Adjustments store "Expired – Past date" in the party column: the kind, then the reason."""
    head, sep, tail = (party_name or '').partition(' – ')
    return (head.strip(), tail.strip()) if sep else ('', (party_name or '').strip())


def describe(e) -> dict:
    """{event, event_label, detail, counterparty} for one ledger row."""
    t, party = e.txn_type, (e.party_name or '').strip()
    ref = ' '.join(x for x in (e.voucher_type if e.voucher_type not in ('Stock Adjustment',) else '', e.voucher_number if e.voucher_number not in ('ADJ', 'OPENING') else '') if x).strip()
    if e.voucher_type == lh.REPAIR_VOUCHER:
        return {'event': 'bookkeeping', 'event_label': 'Opening balance recorded', 'detail': 'Added because its history was empty. Stock did not change.', 'counterparty': ''}
    if e.voucher_type == lh.CORRECTION_VOUCHER:
        return {'event': 'bookkeeping', 'event_label': 'Ledger correction', 'detail': 'Ledger made to agree with the stock. Stock did not change.', 'counterparty': ''}
    if t == 'OPENING':
        return {'event': 'opening', 'event_label': 'Opening stock', 'detail': 'Brought in at set-up', 'counterparty': ''}
    if t == 'PURCHASE_IN':
        return {'event': 'received', 'event_label': 'Received', 'detail': ref, 'counterparty': party}
    if t == 'SALE_OUT':
        return {'event': 'sold', 'event_label': 'Sold', 'detail': ref, 'counterparty': party}
    if t == 'SALE_RETURN':
        return {'event': 'customer_return', 'event_label': 'Customer return', 'detail': ref, 'counterparty': party}
    if t == 'PURCHASE_RETURN':
        return {'event': 'supplier_return', 'event_label': 'Returned to supplier', 'detail': ref, 'counterparty': party}
    kind, reason = _split_reason(party)
    if t == 'ADJUSTMENT_OUT':
        word = KNOWN_REMOVALS.get(kind.lower())
        return {'event': 'written_off', 'event_label': f'Written off: {word}' if word else 'Stock removed', 'detail': reason or kind, 'counterparty': ''}
    if t == 'ADJUSTMENT_IN':
        return {'event': 'added', 'event_label': 'Stock added', 'detail': reason or kind, 'counterparty': ''}
    return {'event': 'other', 'event_label': e.get_txn_type_display() if hasattr(e, 'get_txn_type_display') else t, 'detail': party, 'counterparty': ''}


def pack_of(b, product=None) -> dict:
    """The batch's own pack (billing sells from it); the product's only as a fallback."""
    p = product or getattr(b, 'product', None)
    return {
        'pack_size': (b.pack_size if b and b.pack_size else None) or (p.pack_size if p and p.pack_size else None) or 1,
        'pack_type': (b.pack_type if b else '') or (p.pack_type if p else '') or '',
        'pack_unit': (b.pack_unit if b else '') or (p.pack_unit if p else '') or '',
    }


def row_json(e, show_rates: bool) -> dict:
    d = describe(e)
    pk = pack_of(e.batch, e.product)
    net = float(e.qty_in - e.qty_out)
    row = {
        'id': str(e.id),
        'batch_id': str(e.batch_id) if e.batch_id else None,
        'product_id': str(e.product_id) if e.product_id else None,
        'txn_date': e.txn_date.isoformat(),
        'txn_type': e.txn_type,
        'txn_type_label': d['event_label'],
        'voucher_type': e.voucher_type,
        'voucher_number': e.voucher_number,
        'party_name': e.party_name,
        'product_name': e.product.name if e.product else '',
        'batch_number': e.batch_number,
        'expiry_date': e.expiry_date.isoformat() if e.expiry_date else None,
        **pk,
        'qty_in': float(e.qty_in),
        'qty_out': float(e.qty_out),
        'qty': net,                                   # signed, in packs
        'running_qty': float(e.running_qty),
        'balance_negative': e.running_qty < 0,
        'created_at': e.created_at.isoformat(),
        **d,
        'rate': None, 'value_in': None, 'value_out': None, 'running_value': None,
    }
    if show_rates:
        row.update(rate=float(e.rate), value_in=float(e.value_in), value_out=float(e.value_out), running_value=float(e.running_value))
    return row


def summary_filters():
    """(name, field, Q) for the counts at the top of the page; repair rows are bookkeeping, not movement."""
    book = Q(voucher_type__in=BOOKKEEPING)
    return {
        'received': ('qty_in', Q(txn_type__in=['PURCHASE_IN', 'OPENING']) & ~book),
        'sold': ('qty_out', Q(txn_type='SALE_OUT')),
        'customer_returns': ('qty_in', Q(txn_type='SALE_RETURN')),
        'written_off': ('qty_out', Q(txn_type='ADJUSTMENT_OUT') & ~book),
        'supplier_returns': ('qty_out', Q(txn_type='PURCHASE_RETURN')),
        'added': ('qty_in', Q(txn_type='ADJUSTMENT_IN') & ~book),
    }


def batch_state(b, today=None) -> str:
    today = today or date.today()
    if lh.stock_units(b) <= 0:
        return 'sold_out'
    if b.expiry_date < today:
        return 'expired'
    return 'expiring' if (b.expiry_date - today).days <= 90 else 'ok'


def first_supplier(batch):
    """Distributor, invoice and date of the batch's first POSTED purchase, and whether others supplied it too."""
    from apps.purchases.models import PurchaseItem
    items = (PurchaseItem.objects.filter(batch=batch, invoice__status='POSTED', invoice__distributor__isnull=False)
             .select_related('invoice', 'invoice__distributor').order_by('invoice__invoice_date', 'created_at'))
    first = items.first()
    if not first:
        if batch.supplier_id:      # no purchase invoice, but someone said who supplied it
            return {'distributor_id': str(batch.supplier_id), 'distributor_name': batch.supplier.name, 'invoice_id': None, 'invoice_no': '', 'invoice_date': None,
                    'more_suppliers': False, 'assigned': True}
        return None
    others = items.exclude(invoice__distributor_id=first.invoice.distributor_id).exists()
    return {'distributor_id': str(first.invoice.distributor_id), 'distributor_name': first.invoice.distributor.name, 'invoice_id': str(first.invoice_id),
            'invoice_no': first.invoice.invoice_no, 'invoice_date': first.invoice.invoice_date.isoformat(), 'more_suppliers': others, 'assigned': False}


def batch_card(b, show_rates: bool, today=None, with_supplier=True, with_health=True) -> dict:
    today = today or date.today()
    pk = pack_of(b)
    units = lh.stock_units(b)
    card = {
        'id': str(b.id), 'batch_number': b.batch_no, 'product_id': str(b.product_id) if b.product_id else None,
        'product_name': b.product.name if b.product else 'Custom product', 'manufacturer': b.product.manufacturer if b.product else '',
        'expiry_date': b.expiry_date.isoformat(), 'days_to_expiry': (b.expiry_date - today).days,
        'qty_strips': b.qty_strips, 'qty_loose': b.qty_loose, 'qty_units': units,
        'qty_packs': float(lh.packs(units, pk['pack_size'])), **pk,
        'mrp': float(b.mrp), 'rack_location': b.rack_location or '', 'state': batch_state(b, today),
    }
    if show_rates:
        card['purchase_rate'] = float(b.purchase_rate)
    if with_supplier:
        card['supplier'] = first_supplier(b)
    if with_health:
        ann = lh.annotated_batches(None, True).filter(pk=b.pk).first()
        bucket = lh.classify_batch(ann) if ann else lh.OK
        card['ledger_state'] = bucket if bucket != lh.EMPTY else lh.OK
        card['ledger_state_label'] = lh.LABELS.get(card['ledger_state'], '')
    return card


def products_with_batches(outlet, q: str, show_rates: bool, limit=15, today=None, product_id=None):
    """The product picker: products of this outlet matching a name or batch number, each with its batches (stocked ones first, by expiry)."""
    from apps.inventory.models import MasterProduct
    today = today or date.today()
    base = MasterProduct.objects.filter(batches__outlet=outlet)
    base = base.filter(id=product_id) if product_id else base.filter(Q(name__icontains=q) | Q(batches__batch_no__icontains=q))
    qs = base.distinct().order_by('name')[:limit]
    out = []
    for p in qs:
        batches = list(Batch.objects.filter(outlet=outlet, product=p, is_active=True).select_related('product'))
        batches.sort(key=lambda b: (lh.stock_units(b) <= 0, b.expiry_date if lh.stock_units(b) > 0 else date.max, -b.expiry_date.toordinal()))
        cards = [batch_card(b, show_rates, today, with_supplier=False, with_health=False) for b in batches[:40]]
        out.append({'id': str(p.id), 'name': p.name, 'manufacturer': p.manufacturer, 'batch_count': len(batches), 'stocked_batches': sum(1 for b in batches if lh.stock_units(b) > 0),
                    'batches': cards})
    return out


SOURCE_KINDS = {'saleitem': 'sale', 'purchaseitem': 'purchase', 'salesreturn': 'sale_return', 'debitnote': 'debit_note'}


def resolve_sources(entries) -> dict:
    """
    Which document each ledger row came from, so the screen can open it: {entry id: {kind, id}} (kind is sale / purchase /
    sale_return / debit_note; `id` is the INVOICE id for a sale or purchase, the return's own id otherwise). Rows with no
    source (opening stock, adjustments, repairs) are simply missing. Three queries for a whole page, not one per row.
    """
    from django.contrib.contenttypes.models import ContentType
    from apps.billing.models import SaleItem
    from apps.purchases.models import PurchaseItem

    by_ct = {}
    for e in entries:
        if e.content_type_id and e.object_id:
            by_ct.setdefault(e.content_type_id, set()).add(e.object_id)
    if not by_ct:
        return {}
    models = {ct.id: ct.model for ct in ContentType.objects.filter(id__in=list(by_ct))}
    invoice_of = {}
    for ct_id, ids in by_ct.items():
        if models.get(ct_id) == 'saleitem':
            invoice_of.update({i: inv for i, inv in SaleItem.objects.filter(id__in=ids).values_list('id', 'invoice_id')})
        elif models.get(ct_id) == 'purchaseitem':
            invoice_of.update({i: inv for i, inv in PurchaseItem.objects.filter(id__in=ids).values_list('id', 'invoice_id')})
    out = {}
    for e in entries:
        kind = SOURCE_KINDS.get(models.get(e.content_type_id, ''))
        if not kind or not e.object_id:
            continue
        target = invoice_of.get(e.object_id) if kind in ('sale', 'purchase') else e.object_id
        if target:
            out[str(e.id)] = {'kind': kind, 'id': str(target)}
    return out
