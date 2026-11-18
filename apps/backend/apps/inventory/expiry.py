"""
Expiry Manager: find near-expiry / expired stock (by date range, month, distributor), export it, and write it off.

One rule for "expired": `expiry_date < today` (a batch expiring TODAY is still sellable), the same as
`batchState()` in the frontend and docs/INVENTORY.md. Do not copy the batch-wise report's `<= today`.

The supplier of a batch is the distributor of its FIRST POSTED purchase (a batch has no distributor column).
`moreSuppliers` is true when other distributors also supplied the same batch number.

Stock is counted in PACKS (strips + loose / the batch's pack size), like the rest of inventory.
"""
import re
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from uuid import UUID

from django.db import transaction
from django.db.models import CharField, Count, F, OuterRef, Q, Subquery, UUIDField
from django.db.models.functions import Coalesce

from apps.inventory.models import Batch
from apps.purchases.models import PurchaseItem

DEFAULT_WINDOW_DAYS = 90
MAX_IDS = 5000                      # "select all matching" is refused above this
MAX_REMOVE_ITEMS = 500              # one write-off request
REMOVAL_TYPES = {'EXPIRED': 'Expired', 'DAMAGED': 'Damaged', 'DESTROYED': 'Destroyed'}
UNKNOWN = 'none'                    # the distributor filter value for "no purchase record"


class ExpiryParamError(ValueError):
    pass


class RemovalError(Exception):
    def __init__(self, code, message, batch_id=None):
        super().__init__(message)
        self.code, self.message, self.batch_id = code, message, batch_id


def _money(v):
    return (Decimal(str(v or 0))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _date(raw, name):
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError):
        raise ExpiryParamError(f'{name} must be a date like 2027-03-31')


@dataclass
class ExpiryFilters:
    ranges: list = field(default_factory=list)       # [(from or None, to or None)], inclusive
    include_expired: bool = False
    distributor_ids: list = field(default_factory=list)
    unknown_distributor: bool = False
    q: str = ''
    sort: str = 'expiry'


def parse_filters(params, today=None) -> ExpiryFilters:
    """From the query string. No date given at all = the next 90 days plus everything already expired."""
    today = today or date.today()
    f = ExpiryFilters()

    for m in [x.strip() for x in (params.get('months') or '').split(',') if x.strip()]:
        if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', m):
            raise ExpiryParamError('months must look like 2027-03,2027-04')
        y, mo = int(m[:4]), int(m[5:])
        f.ranges.append((date(y, mo, 1), date(y, mo, monthrange(y, mo)[1])))

    start, end = params.get('from'), params.get('to')
    if start or end:
        a = _date(start, 'from') if start else None
        b = _date(end, 'to') if end else None
        if a and b and a > b:
            raise ExpiryParamError('"from" is after "to"')
        f.ranges.append((a, b))

    f.include_expired = str(params.get('includeExpired', '')).lower() in ('1', 'true', 'yes')
    if not f.ranges:
        f.ranges = [(today, today + timedelta(days=DEFAULT_WINDOW_DAYS))]
        f.include_expired = True

    for d in [x.strip() for x in (params.get('distributorIds') or '').split(',') if x.strip()]:
        if d == UNKNOWN:
            f.unknown_distributor = True
            continue
        try:
            f.distributor_ids.append(str(UUID(d)))
        except ValueError:
            raise ExpiryParamError('distributorIds must be ids (or "none")')

    f.q = (params.get('q') or '').strip()[:100]
    sort = params.get('sort') or 'expiry'
    f.sort = sort if sort in ('expiry', 'distributor', 'product', 'value') else 'expiry'
    return f


def _first_posted_purchase():
    return (PurchaseItem.objects
            .filter(batch=OuterRef('pk'), invoice__status='POSTED', invoice__distributor__isnull=False)
            .order_by('invoice__invoice_date', 'created_at'))


def annotated_batches(outlet):
    """Every active batch of the outlet that still holds stock, with its first supplier."""
    first = _first_posted_purchase()
    suppliers = (PurchaseItem.objects.filter(batch=OuterRef('pk'), invoice__status='POSTED', invoice__distributor__isnull=False)
                 .order_by().values('batch').annotate(c=Count('invoice__distributor_id', distinct=True)).values('c'))
    return (Batch.objects.filter(outlet=outlet, is_active=True).filter(Q(qty_strips__gt=0) | Q(qty_loose__gt=0))
            .select_related('product')
            .annotate(dist_id=Coalesce(Subquery(first.values('invoice__distributor_id')[:1]), F('supplier_id'), output_field=UUIDField()),       # a posted purchase wins; else the supplier assigned to the batch
                      dist_name=Coalesce(Subquery(first.values('invoice__distributor__name')[:1]), F('supplier__name'), output_field=CharField()),
                      inv_id=Subquery(first.values('invoice_id')[:1]),
                      inv_no=Subquery(first.values('invoice__invoice_no')[:1]),
                      dist_count=Subquery(suppliers[:1])))


def expiry_queryset(outlet, f: ExpiryFilters, today=None):
    """Those batches inside the window, narrowed by distributor and search."""
    today = today or date.today()
    window = Q()
    for a, b in f.ranges:
        part = Q()
        if a:
            part &= Q(expiry_date__gte=a)
        if b:
            part &= Q(expiry_date__lte=b)
        window |= part
    if f.include_expired:
        window |= Q(expiry_date__lt=today)

    qs = annotated_batches(outlet).filter(window)
    if f.distributor_ids or f.unknown_distributor:
        dq = Q(dist_id__in=f.distributor_ids) if f.distributor_ids else Q()
        if f.unknown_distributor:
            dq |= Q(dist_id__isnull=True)
        qs = qs.filter(dq)
    if f.q:
        qs = qs.filter(Q(product__name__icontains=f.q) | Q(batch_no__icontains=f.q))
    return qs


def packs_of(b) -> Decimal:
    size = b.pack_size or 1
    return Decimal(b.qty_strips or 0) + Decimal(b.qty_loose or 0) / Decimal(size)


def row_of(b, today, show_rates: bool) -> dict:
    packs = packs_of(b)
    cost_rate = b.landing_rate if b.landing_rate is not None else b.purchase_rate   # the project's cost value is at landing
    row = {
        'id': str(b.id),
        'productId': str(b.product_id) if b.product_id else None,
        'productName': b.product.name if b.product else 'Custom product',
        'manufacturer': b.product.manufacturer if b.product else '',
        'batchNo': b.batch_no,
        'expiryDate': b.expiry_date.isoformat(),
        'daysToExpiry': (b.expiry_date - today).days,
        'qtyStrips': b.qty_strips, 'qtyLoose': b.qty_loose,
        'packSize': b.pack_size or 1, 'packType': b.pack_type, 'packUnit': b.pack_unit,
        'packs': float(round(packs, 3)),
        'mrp': float(b.mrp),
        'mrpValue': float(_money(packs * b.mrp)),
        'rackLocation': b.rack_location or '',
        'distributorId': str(b.dist_id) if b.dist_id else None,
        'distributorName': b.dist_name or '',
        'moreSuppliers': (b.dist_count or 0) > 1,
        'supplierAssigned': bool(b.dist_id and not b.inv_id),         # known from an assignment, not from a purchase invoice
        'purchaseInvoiceId': str(b.inv_id) if b.inv_id else None,     # the invoice a debit note (return) is made against
        'purchaseInvoiceNo': b.inv_no or '',
    }
    if show_rates:
        row['purchaseRate'] = float(b.purchase_rate)
        row['landingRate'] = float(b.landing_rate) if b.landing_rate is not None else None
        row['costValue'] = float(_money(packs * cost_rate))
    return row


_SORTS = {
    'expiry': lambda r: (r['expiryDate'], r['productName'].lower()),
    'distributor': lambda r: (r['distributorName'] == '', r['distributorName'].lower(), r['expiryDate']),
    'product': lambda r: (r['productName'].lower(), r['expiryDate']),
}


def summarize(rows, show_rates: bool):
    """Totals and per-distributor groups over EVERY matching row (not just the page on screen)."""
    totals = {
        'batches': len(rows),
        'products': len({r['productId'] or r['productName'] for r in rows}),
        'expiredBatches': sum(1 for r in rows if r['daysToExpiry'] < 0),
        'mrpValue': float(_money(sum(Decimal(str(r['mrpValue'])) for r in rows))),
    }
    groups = {}
    for r in rows:
        g = groups.setdefault(r['distributorId'], {'distributorId': r['distributorId'], 'name': r['distributorName'] or 'No purchase record',
                                                   'batches': 0, 'mrpValue': Decimal('0'), 'costValue': Decimal('0')})
        g['batches'] += 1
        g['mrpValue'] += Decimal(str(r['mrpValue']))
        if show_rates:
            g['costValue'] += Decimal(str(r['costValue']))
    out = []
    for g in groups.values():
        item = {'distributorId': g['distributorId'], 'name': g['name'], 'batches': g['batches'], 'mrpValue': float(_money(g['mrpValue']))}
        if show_rates:
            item['costValue'] = float(_money(g['costValue']))
        out.append(item)
    out.sort(key=lambda g: (g['distributorId'] is None, g['name'].lower()))
    totals['distributors'] = sum(1 for g in out if g['distributorId'])
    if show_rates:
        totals['costValue'] = float(_money(sum(Decimal(str(r['costValue'])) for r in rows)))
    return totals, out


def sort_rows(rows, sort):
    if sort == 'value':
        rows.sort(key=lambda r: -(r.get('costValue', r['mrpValue'])))
    else:
        rows.sort(key=_SORTS[sort])
    return rows


def build_rows(outlet, f: ExpiryFilters, show_rates: bool, today=None):
    today = today or date.today()
    rows = [row_of(b, today, show_rates) for b in expiry_queryset(outlet, f, today)]
    return sort_rows(rows, f.sort)


# ───────────────────────────── write-off ─────────────────────────────

def confirms_identity(user, secret) -> bool:
    """
    Is `secret` the signed-in user's own password (or their staff PIN: the login box takes either, so this one does too)?
    Used to confirm a write-off by the person who is actually signed in, not by "any staff PIN of the outlet".
    """
    from django.contrib.auth.hashers import check_password
    if user.check_password(secret):
        return True
    return bool(getattr(user, 'staff_pin', '')) and check_password(secret, user.staff_pin)


def _count(v, name, batch_id):
    if v is None or v == '':
        return None
    if isinstance(v, bool) or not isinstance(v, int) or v < 0:
        raise RemovalError('BAD_QTY', f'{name} must be a whole number, 0 or more', batch_id)
    return v


@transaction.atomic
def remove_stock_bulk(*, outlet, items, adjustment_type, reason, staff, actor):
    """
    Write stock off for many batches in ONE transaction: if any batch cannot be written off, NOTHING is.

    items: [{batchId, qtyStrips?, qtyLoose?}]; no quantity at all = everything the batch holds.
    Raises RemovalError (the transaction rolls back). Returns one dict per batch.
    """
    from apps.audit import recorder
    from apps.inventory.ledger_health import open_if_missing
    from apps.inventory.services import post_stock_ledger_entry

    if adjustment_type not in REMOVAL_TYPES:
        raise RemovalError('BAD_TYPE', 'type must be EXPIRED, DAMAGED or DESTROYED')
    if not items:
        raise RemovalError('NO_ITEMS', 'Choose at least one batch')
    if len(items) > MAX_REMOVE_ITEMS:
        raise RemovalError('TOO_MANY', f'At most {MAX_REMOVE_ITEMS} batches at a time')

    wanted = {}
    for it in items:
        try:
            bid = str(UUID(str(it.get('batchId'))))
        except (ValueError, AttributeError):
            raise RemovalError('BAD_BATCH', 'A batch id is missing or invalid')
        if bid in wanted:
            raise RemovalError('DUPLICATE', 'The same batch is listed twice', bid)
        wanted[bid] = it

    # lock in a fixed order (two people removing overlapping batches cannot deadlock); `of=self`: Postgres refuses
    # FOR UPDATE on the nullable product join. The outlet filter means an id from another outlet is simply "not found".
    locked = {str(b.id): b for b in Batch.objects.select_for_update(of=('self',)).select_related('product')
              .filter(id__in=list(wanted), outlet=outlet).order_by('id')}
    for bid in wanted:
        if bid not in locked:
            raise RemovalError('NOT_FOUND', 'A batch was not found in this outlet', bid)

    today = date.today()
    label = REMOVAL_TYPES[adjustment_type]
    note = (reason or '').strip()
    done = []
    for bid, it in wanted.items():
        b = locked[bid]
        size = b.pack_size or 1
        held = (b.qty_strips or 0) * size + (b.qty_loose or 0)
        rs, rl = _count(it.get('qtyStrips'), 'qtyStrips', bid), _count(it.get('qtyLoose'), 'qtyLoose', bid)
        take = held if rs is None and rl is None else (rs or 0) * size + (rl or 0)
        name = f"{b.product.name if b.product else 'Custom product'} {b.batch_no}"
        if take <= 0:
            raise RemovalError('NOTHING_TO_REMOVE', f'{name}: nothing to remove', bid)
        if take > held:
            raise RemovalError('INSUFFICIENT', f'{name}: only {held} unit(s) in stock, cannot remove {take}', bid)

        old = {'qty_strips': b.qty_strips, 'qty_loose': b.qty_loose}
        left = held - take
        b.qty_strips, b.qty_loose = left // size, left % size
        b.save(update_fields=['qty_strips', 'qty_loose'])

        packs_out = Decimal(take) / Decimal(size)
        # a batch with no ledger history would otherwise start from zero and show a NEGATIVE balance after this write-off
        open_if_missing(outlet, b, Decimal(held) / Decimal(size), actor)
        post_stock_ledger_entry(
            outlet=outlet, product=b.product, batch=b, txn_type='ADJUSTMENT_OUT', txn_date=today,
            voucher_type='Stock Adjustment', voucher_number='ADJ',
            party_name=f'{label} – {note or "Expiry write-off"}',
            qty_in=0, qty_out=packs_out, rate=b.purchase_rate, source_object=b, actor=actor,
            adjustment_type=adjustment_type, adjustment_reason=note or None,
        )
        cost_rate = b.landing_rate if b.landing_rate is not None else b.purchase_rate
        done.append({
            'batchId': bid, 'batchNo': b.batch_no, 'productName': b.product.name if b.product else 'Custom product',
            'removedUnits': take, 'removedPacks': float(round(packs_out, 3)),
            'costValue': float(_money(packs_out * cost_rate)),
        })
        done[-1]['_expired'] = b.expiry_date < today
        done[-1]['_before'] = {'strips': old['qty_strips'], 'loose': old['qty_loose']}
    # ONE event for the whole removal (not one per batch): who, how many, how much, how many had not expired. The rules read the metadata.
    total_cost = sum(d['costValue'] for d in done)
    not_expired = sum(1 for d in done if not d['_expired'])
    recorder.safe_record(
        'stock.bulk_written_off', actor=actor, outlet=outlet, module='inventory', action='ADJUST', entity_type='Batch',
        entity_label=f"{len(done)} batch{'es' if len(done) != 1 else ''}", amount=total_cost, reason=f'{label}: {note}' if note else label,
        reason_code=adjustment_type, ctx={'count': len(done)},
        changes=[{'field': d['batchNo'], 'label': f"{d['productName']} · batch {d['batchNo']}", 'before': 'In stock', 'after': f"{d['removedUnits']} unit(s) removed"} for d in done[:200]],
        metadata={'count': len(done), 'value': total_cost, 'not_expired': not_expired, 'kind': adjustment_type,
                  'items': [{'batchId': d['batchId'], 'batchNo': d['batchNo'], 'product': d['productName'], 'units': d['removedUnits'], 'value': d['costValue'], 'expired': d['_expired']} for d in done[:200]]},
    )
    for d in done:
        d.pop('_expired', None)
        d.pop('_before', None)
    return done


# ───────────────────────────── Excel ─────────────────────────────

def build_workbook(rows, totals, groups, show_rates: bool, outlet_name: str, subtitle: str) -> bytes:
    import openpyxl
    from openpyxl.styles import Alignment
    from apps.inventory import xlsx_helpers as xh

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Near expiry'
    xh.title_block(ws, f'Near-expiry stock · {outlet_name}', subtitle)

    cols = ['Distributor', 'Product', 'Manufacturer', 'Batch', 'Expiry', 'Days left', 'Strips', 'Loose', 'Pack size', 'Packs', 'MRP']
    widths = [26, 32, 28, 14, 13, 9, 8, 8, 9, 9, 10]
    if show_rates:
        cols += ['Purchase rate', 'Landing rate', 'Cost value']
        widths += [13, 13, 14]
    cols += ['MRP value', 'Rack']
    widths += [14, 12]
    ncols = len(cols)
    idx = {name: i for i, name in enumerate(cols, start=1)}
    xh.header(ws, 4, cols, widths, right={idx[c] for c in ('Days left', 'Strips', 'Loose', 'Pack size', 'Packs', 'MRP', 'MRP value', 'Purchase rate', 'Landing rate', 'Cost value') if c in idx})

    for r in rows:
        line = [xh.safe(r['distributorName'] or 'No purchase record') + ('' if not r['moreSuppliers'] else ' (+ more)'), xh.safe(r['productName']),
                xh.safe(r['manufacturer']), xh.safe(r['batchNo']), date.fromisoformat(r['expiryDate']), r['daysToExpiry'],
                r['qtyStrips'], r['qtyLoose'], r['packSize'], r['packs'], r['mrp']]
        if show_rates:
            line += [r['purchaseRate'], r['landingRate'] if r['landingRate'] is not None else '', r['costValue']]
        line += [r['mrpValue'], xh.safe(r['rackLocation'])]
        ws.append(line)
    last = ws.max_row
    money = {idx[c]: xh.MONEY for c in ('MRP', 'MRP value', 'Purchase rate', 'Landing rate', 'Cost value') if c in idx}
    xh.style_cells(ws, 5, last, {idx['Expiry']: xh.DATE, idx['Days left']: xh.INT, idx['Packs']: xh.PACKS, **money},
                   right={idx[c] for c in ('Days left', 'Strips', 'Loose', 'Pack size', 'Packs', 'MRP', 'MRP value', 'Purchase rate', 'Landing rate', 'Cost value') if c in idx})
    for n, r in enumerate(rows, start=5):
        if r['daysToExpiry'] < 0:
            ws.cell(row=n, column=idx['Days left']).font = xh.RED          # expired: red AND a negative number of days

    total = ['Total', f"{totals['batches']} batches"] + [''] * (ncols - 2)
    total[idx['MRP value'] - 1] = totals['mrpValue']
    if show_rates:
        total[idx['Cost value'] - 1] = totals['costValue']
    ws.append(total)
    xh.total_row(ws, ws.max_row, ncols)
    for name in ('MRP value', 'Cost value'):
        if name in idx:
            ws.cell(row=ws.max_row, column=idx[name]).number_format = xh.MONEY
            ws.cell(row=ws.max_row, column=idx[name]).alignment = Alignment(horizontal='right')
    xh.finish(ws, 4, last, ncols, freeze_cols=2)

    s2 = wb.create_sheet('By distributor')
    heads = ['Distributor', 'Batches', 'MRP value'] + (['Cost value'] if show_rates else [])
    xh.header(s2, 1, heads, [34, 10, 16, 16], right={2, 3, 4})
    for g in groups:
        s2.append([xh.safe(g['name']), g['batches'], g['mrpValue']] + ([g['costValue']] if show_rates else []))
    xh.style_cells(s2, 2, s2.max_row, {2: xh.INT, 3: xh.MONEY, 4: xh.MONEY}, right={2, 3, 4})
    xh.finish(s2, 1, s2.max_row, len(heads), landscape=False)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
