"""
Purchase-order business rules, in one place.

    Shortbook -> Draft (stored as SAVED) -> Sent -> Partial -> Completed        (+ Cancelled, Expired)

* Every change of `PurchaseOrder.status` goes through `transition()`. It checks the move against ALLOWED, writes a POEvent, keeps the
  Shortbook in step and runs in one DB transaction. Nothing else may set `status`.
* Only a Draft's lines can be edited (and only with the version the client loaded: optimistic lock).
* Receiving is DERIVED: `recompute_receipts()` sums the lines of every posted purchase invoice linked to the PO. Saving, editing or
  removing an invoice just calls it again, so the numbers can never drift.
* `on_order_map()` is the single definition of "already ordered": open (Sent / Partial) quantity not yet received.
"""
import logging
import math
import re
import secrets
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Iterable, List, Optional

from django.db import transaction
from django.db.models import F, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Greatest
from django.utils import timezone

from apps.purchases.models import (
    Distributor, POEvent, POSequence, PurchaseInvoice, PurchaseItem, PurchaseOrder, PurchaseOrderItem, ShortbookItem,
)
from apps.purchases.services import PurchaseServiceError

logger = logging.getLogger(__name__)

TWO = Decimal('0.01')
OPEN_STATUSES = ('SAVED', 'SENT', 'PARTIAL')
CLOSED_STATUSES = ('COMPLETED', 'CANCELLED', 'EXPIRED')


class POError(PurchaseServiceError):
    """A rule about purchase orders was broken. `message` is safe to show; `status_code` is the HTTP status to answer with."""

    def __init__(self, message: str, status_code: int = 409, code: str = 'PO_RULE'):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


# Which actions each status allows (the plan's lock table). Permissions are layered on top in the views.
STATE_ACTIONS = {
    'SAVED': ['edit', 'send', 'mark_ordered', 'cancel', 'duplicate', 'delete'],
    'SENT': ['resend', 'receive', 'cancel', 'duplicate'],
    'PARTIAL': ['receive', 'close_short', 'duplicate'],
    'COMPLETED': ['duplicate'],
    'CANCELLED': ['duplicate'],
    'EXPIRED': ['duplicate'],
}


def today() -> date:
    return datetime.now().date()          # the app runs on server (IST) time, like the rest of the purchase code


def money(value) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, '') else 0)).quantize(TWO, ROUND_HALF_UP)
    except Exception:
        raise POError('A rate or amount is not a valid number.', 400, 'BAD_NUMBER')


def outlet_settings(outlet):
    from apps.core.models import OutletSettings
    return OutletSettings.objects.get_or_create(outlet=outlet)[0]


def event(po: PurchaseOrder, action: str, user=None, **payload) -> POEvent:
    return POEvent.objects.create(purchase_order=po, action=action, user=user if getattr(user, 'pk', None) else None, payload=payload)


# ───────────────────────────── numbering ─────────────────────────────

def mint_po_number(outlet) -> str:
    """PO-YYYYMMDD-NNN from a per-outlet-per-day counter read under a row lock (plus a unique constraint as a backstop)."""
    prefix = (outlet_settings(outlet).po_number_prefix or 'PO').strip() or 'PO'
    day = today()
    stem = f'{prefix}-{day:%Y%m%d}-'
    with transaction.atomic():
        seq, created = POSequence.objects.select_for_update().get_or_create(outlet=outlet, date=day)
        if created:
            # first PO of the day under the new scheme: start after any number already issued today by the old one
            highest = 0
            for number in PurchaseOrder.objects.filter(outlet=outlet, po_number__startswith=stem).values_list('po_number', flat=True):
                m = re.match(r'^(\d+)', number[len(stem):])
                if m:
                    highest = max(highest, int(m.group(1)))
            seq.last_no = highest
        seq.last_no += 1
        seq.save(update_fields=['last_no'])
        return f'{stem}{seq.last_no:03d}'


# ───────────────────────────── stock facts ─────────────────────────────

def on_order_map(outlet_id, product_ids: Optional[Iterable] = None) -> Dict[str, int]:
    """product_id -> quantity ordered on Sent / Partial POs and not yet received. THE definition of "on order"."""
    qs = PurchaseOrderItem.objects.filter(purchase_order__outlet_id=outlet_id, purchase_order__status__in=['SENT', 'PARTIAL'])
    if product_ids is not None:
        qs = qs.filter(product_id__in=list(product_ids))
    rows = qs.values('product_id').annotate(
        qty=Sum(Greatest(F('qty_strips') - F('received_qty'), Value(0), output_field=IntegerField())))
    return {str(r['product_id']): int(r['qty'] or 0) for r in rows}


def on_order_qty(outlet_id, product_id) -> int:
    return on_order_map(outlet_id, [product_id]).get(str(product_id), 0)


def line_insights(outlet_id, product_ids: List) -> Dict[str, dict]:
    """Current stock (packs), minimum, on-order and last purchase rate for products: what a PO line shows when reopened."""
    from apps.inventory.models import Batch, MasterProduct, OutletProductConfig
    out = {str(p): {'currentStock': 0.0, 'minQty': 0.0, 'onOrder': 0, 'lastRate': None} for p in product_ids}
    if not out:
        return out
    # pack size and last purchase rate for every product in ONE query (a subquery per product, not a query per product)
    last_rate = PurchaseItem.objects.filter(invoice__outlet_id=outlet_id, master_product_id=OuterRef('pk')).order_by(
        '-invoice__invoice_date', '-invoice__created_at').values('purchase_rate')[:1]
    meta = list(MasterProduct.objects.filter(id__in=product_ids).annotate(last_rate=Subquery(last_rate)))
    packs = {str(p.id): (p.pack_size or 1) for p in meta}
    for r in Batch.objects.filter(outlet_id=outlet_id, is_active=True, product_id__in=product_ids).values('product_id').annotate(
            s=Sum('qty_strips'), l=Sum('qty_loose')):
        pid = str(r['product_id'])
        out[pid]['currentStock'] = round(float(r['s'] or 0) + float(r['l'] or 0) / float(packs.get(pid) or 1), 2)
    for c in OutletProductConfig.objects.filter(outlet_id=outlet_id, product_id__in=product_ids):
        out[str(c.product_id)]['minQty'] = float(c.min_qty or 0)
    for pid, q in on_order_map(outlet_id, product_ids).items():
        out[pid]['onOrder'] = q
    for p in meta:
        if p.last_rate is not None:
            out[str(p.id)]['lastRate'] = str(Decimal(p.last_rate).quantize(TWO))
    return out


def suggest_rate(outlet_id, product) -> Decimal:
    """Last purchase rate -> latest batch purchase rate -> batch PTR -> catalogue MRP."""
    from apps.inventory.models import Batch
    last = PurchaseItem.objects.filter(invoice__outlet_id=outlet_id, master_product_id=product.id).order_by(
        '-invoice__invoice_date', '-invoice__created_at').values_list('purchase_rate', flat=True).first()
    if last and Decimal(last) > 0:
        return money(last)
    batch = Batch.objects.filter(outlet_id=outlet_id, product_id=product.id).order_by('-created_at').first()
    if batch:
        for v in (batch.purchase_rate, batch.ptr):
            if v and Decimal(v) > 0:
                return money(v)
    return money(product.mrp or 0)


def suggest_distributor(outlet_id, product_id) -> Optional[Distributor]:
    inv = PurchaseItem.objects.filter(invoice__outlet_id=outlet_id, master_product_id=product_id).order_by(
        '-invoice__invoice_date', '-invoice__created_at').select_related('invoice__distributor').first()
    return inv.invoice.distributor if inv else None


def pack_label(product) -> str:
    size = getattr(product, 'pack_size', None)
    kind = getattr(product, 'pack_type', None) or 'strip'
    return f'{size} {kind}' if size else ''


# ───────────────────────────── building a PO ─────────────────────────────

def _parse_lines(items) -> List[dict]:
    """Validate the lines a client sent. Nothing is dropped silently: a bad line is an error that names the product."""
    from apps.inventory.models import MasterProduct
    if not items:
        raise POError('Add at least one item before saving.', 400, 'NO_ITEMS')
    parsed, seen = [], set()
    for raw in items:
        pid = raw.get('productId') or raw.get('masterProductId')
        if not pid:
            raise POError('A line has no product.', 400, 'BAD_LINE')
        try:
            product = MasterProduct.objects.get(id=pid)
        except (MasterProduct.DoesNotExist, ValueError, Exception):
            raise POError('A product on this order no longer exists.', 400, 'BAD_LINE')
        raw_qty = raw.get('orderQty', raw.get('qty', raw.get('qtyStrips', raw.get('deficit', 0))))
        try:
            qty = int(Decimal(str(raw_qty if raw_qty not in (None, '') else 0)))
        except Exception:
            raise POError(f'"{product.name}": quantity must be a whole number.', 400, 'BAD_QTY')
        if qty <= 0:
            raise POError(f'"{product.name}": order quantity must be at least 1 (remove the line instead).', 400, 'BAD_QTY')
        rate = money(raw.get('estRate', raw.get('estimatedPtr', raw.get('lastRate', 0))))
        if rate < 0:
            raise POError(f'"{product.name}": rate cannot be negative.', 400, 'BAD_RATE')
        if str(product.id) in seen:
            raise POError(f'"{product.name}" is on this order twice. Combine the quantities into one line.', 400, 'DUPLICATE_LINE')
        seen.add(str(product.id))
        parsed.append({'product': product, 'qty': qty, 'rate': rate, 'shortbook_item_id': raw.get('shortbookItemId')})
    return parsed


def _write_lines(po: PurchaseOrder, lines: List[dict]) -> Decimal:
    total = Decimal('0.00')
    for ln in lines:
        amount = (ln['rate'] * ln['qty']).quantize(TWO, ROUND_HALF_UP)
        total += amount
        PurchaseOrderItem.objects.create(
            purchase_order=po, product=ln['product'], qty_strips=ln['qty'], last_rate=ln['rate'], unit_ptr_estimated=ln['rate'],
            taxable_amount=amount, pack_size_snapshot=pack_label(ln['product']), shortbook_item_id=ln.get('shortbook_item_id'))
    return total


def get_distributor(outlet, distributor_id) -> Distributor:
    if not distributor_id:
        raise POError('Pick a distributor before saving.', 400, 'NO_DISTRIBUTOR')
    try:
        return Distributor.objects.get(id=distributor_id, outlet=outlet)
    except (Distributor.DoesNotExist, ValueError, Exception):
        raise POError('That distributor was not found.', 400, 'NO_DISTRIBUTOR')


@transaction.atomic
def create_po(outlet, distributor_id, items, user=None, notes: str = '', expected_date=None) -> PurchaseOrder:
    distributor = get_distributor(outlet, distributor_id)
    lines = _parse_lines(items)
    po = PurchaseOrder.objects.create(outlet=outlet, distributor=distributor, po_number=mint_po_number(outlet), status='SAVED',
                                      notes=(notes or '')[:2000], expected_date=expected_date or None)
    po.total_amount = _write_lines(po, lines)
    po.save(update_fields=['total_amount'])
    linked = [ln['shortbook_item_id'] for ln in lines if ln.get('shortbook_item_id')]
    if linked:
        ShortbookItem.objects.filter(id__in=linked).update(status='IN_DRAFT')
    event(po, 'created', user, items=len(lines), total=str(po.total_amount))
    return po


@transaction.atomic
def replace_items(po: PurchaseOrder, items, user=None, expected_version=None, notes=None, expected_date=None,
                  distributor_id=None) -> PurchaseOrder:
    """Edit a Draft: replace its lines. Only a Draft; only with the version the client loaded."""
    po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
    if po.status != 'SAVED':
        raise POError(f'{po.po_number} is {po.status_label}. Only a Draft can be edited: duplicate it to start a new one.', 409, 'LOCKED')
    if expected_version is not None and int(expected_version) != po.version:
        raise POError('This PO was changed by someone else. Reload it and try again.', 409, 'STALE')
    if distributor_id and str(distributor_id) != str(po.distributor_id):
        po.distributor = get_distributor(po.outlet, distributor_id)
    lines = _parse_lines(items)

    # Shortbook items whose line was removed go back to Pending; kept / added ones are In draft
    before = {str(x) for x in po.items.exclude(shortbook_item__isnull=True).values_list('shortbook_item_id', flat=True)}
    po.items.all().delete()
    po.total_amount = _write_lines(po, lines)
    after = {str(ln['shortbook_item_id']) for ln in lines if ln.get('shortbook_item_id')}
    ShortbookItem.objects.filter(id__in=list(before - after), status='IN_DRAFT').update(status='PENDING')
    ShortbookItem.objects.filter(id__in=list(after)).update(status='IN_DRAFT')
    if notes is not None:
        po.notes = notes[:2000]
    if expected_date is not None:
        po.expected_date = expected_date or None
    po.version += 1
    po.save()
    event(po, 'edited', user, items=len(lines), total=str(po.total_amount))
    return po


@transaction.atomic
def delete_draft(po: PurchaseOrder, user=None) -> None:
    po = PurchaseOrder.objects.select_for_update().get(pk=po.pk)
    if po.status != 'SAVED':
        raise POError(f'{po.po_number} is {po.status_label}. Only a Draft can be deleted: cancel it instead.', 409, 'LOCKED')
    ShortbookItem.objects.filter(po_lines__purchase_order=po, status='IN_DRAFT').update(status='PENDING')
    po.delete()


@transaction.atomic
def duplicate_po(po: PurchaseOrder, user=None) -> PurchaseOrder:
    """A new Draft with the same distributor and lines (at today's pack labels), for re-ordering."""
    copy = PurchaseOrder.objects.create(outlet=po.outlet, distributor=po.distributor, po_number=mint_po_number(po.outlet), status='SAVED',
                                        notes=po.notes)
    lines = [{'product': it.product, 'qty': it.qty_strips, 'rate': it.last_rate} for it in po.items.select_related('product')]
    copy.total_amount = _write_lines(copy, lines)
    copy.save(update_fields=['total_amount'])
    event(copy, 'created', user, duplicated_from=po.po_number, items=len(lines))
    event(po, 'duplicated', user, copy=copy.po_number)
    return copy


# ───────────────────────────── shortbook ─────────────────────────────

def shortbook_add(outlet, product_id, qty=1, source='manual', user=None, note='', customer_name='', customer_phone='',
                  distributor_id=None) -> ShortbookItem:
    """Add a need. A product that is already open in the Shortbook gets its quantity raised instead of a second row."""
    from apps.inventory.models import MasterProduct
    try:
        product = MasterProduct.objects.get(id=product_id)
    except (MasterProduct.DoesNotExist, ValueError, Exception):
        raise POError('That product was not found.', 400, 'NO_PRODUCT')
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        raise POError('Quantity must be a whole number.', 400, 'BAD_QTY')
    if qty < 1:
        raise POError('Quantity must be at least 1.', 400, 'BAD_QTY')
    with transaction.atomic():
        item = ShortbookItem.objects.select_for_update().filter(outlet=outlet, product=product, status__in=ShortbookItem.OPEN_STATUSES).first()
        if item:
            item.qty_needed += qty
            if note:
                item.note = note[:255]
            item.save()
            return item
        dist = get_distributor(outlet, distributor_id) if distributor_id else suggest_distributor(outlet.id, product.id)
        return ShortbookItem.objects.create(
            outlet=outlet, product=product, qty_needed=qty, source=source, suggested_distributor=dist, note=note[:255],
            customer_name=customer_name[:255], customer_phone=customer_phone[:20], created_by=user if getattr(user, 'pk', None) else None)


def _return_to_shortbook(line: PurchaseOrderItem, qty: int, user=None) -> None:
    """A line that will not arrive (cancel / expire / close short) goes back to Pending with what is still needed."""
    if qty <= 0:
        return
    item = line.shortbook_item
    open_row = ShortbookItem.objects.select_for_update().filter(outlet=line.purchase_order.outlet, product=line.product,
                                                                status__in=ShortbookItem.OPEN_STATUSES).first()
    if item and item.status in ('IN_DRAFT', 'ORDERED') and (open_row is None or open_row.pk == item.pk):
        item.status, item.qty_needed = 'PENDING', qty
        item.save()
    elif open_row:
        open_row.qty_needed += qty
        open_row.save()
        if item and item.pk != open_row.pk and item.status in ('IN_DRAFT', 'ORDERED'):
            item.status = 'REMOVED'
            item.save()
    else:
        ShortbookItem.objects.create(outlet=line.purchase_order.outlet, product=line.product, qty_needed=qty, source='low_stock',
                                     suggested_distributor=line.purchase_order.distributor, status='PENDING',
                                     note=f'Returned from {line.purchase_order.po_number}')


def group_filter(item_ids, distributor_ids=None) -> Q:
    """Items picked one by one (`item_ids`) and/or "everything pending for these distributors" (`distributor_ids`, from a group-wide select-all)."""
    q = Q(id__in=item_ids or [])
    real = [d for d in (distributor_ids or []) if d and d != 'none']
    if real:
        q |= Q(suggested_distributor_id__in=real)
    return q


@transaction.atomic
def create_pos_from_shortbook(outlet, item_ids, user=None, distributor_ids=None) -> List[PurchaseOrder]:
    """One Draft PO per distributor from the ticked Shortbook items (and/or whole distributor groups), with the lines linked back."""
    items = list(ShortbookItem.objects.select_related('product', 'suggested_distributor').filter(
        outlet=outlet, status='PENDING').filter(group_filter(item_ids, distributor_ids)))
    if not items:
        raise POError('Pick at least one pending item.', 400, 'NO_ITEMS')
    missing = [i.product.name for i in items if not i.suggested_distributor_id]
    if missing:
        raise POError('Choose a distributor for: ' + ', '.join(missing[:5]) + ('…' if len(missing) > 5 else ''), 400, 'NO_DISTRIBUTOR')
    groups: Dict[str, List[ShortbookItem]] = {}
    for it in items:
        groups.setdefault(str(it.suggested_distributor_id), []).append(it)
    made = []
    for dist_id, group in groups.items():
        lines = [{'productId': str(g.product_id), 'orderQty': g.qty_needed, 'estRate': str(suggest_rate(outlet.id, g.product)),
                  'shortbookItemId': str(g.id)} for g in group]
        made.append(create_po(outlet, dist_id, lines, user))
    return made


def low_stock_candidates(outlet_id, distributor_id=None, limit=200) -> List[dict]:
    """Products at or below their minimum once on-order is counted: the Shortbook's low-stock source and "Pull low stock" on a PO."""
    from django.db.models import Subquery, OuterRef, ExpressionWrapper, FloatField
    from django.db.models.functions import Cast, Coalesce, NullIf
    from apps.inventory.models import Batch, MasterProduct, OutletProductConfig

    # Only products the outlet has given a minimum: "no minimum set" means "not tracked", never "minimum 0" (that made every empty shelf look
    # low and flooded the Shortbook). It is also what keeps this query small: a handful of products instead of the whole catalogue.
    config_ids = OutletProductConfig.objects.filter(outlet_id=outlet_id, min_qty__gt=0).values('product_id')
    products = MasterProduct.objects.filter(id__in=config_ids)

    config_sq = OutletProductConfig.objects.filter(outlet_id=outlet_id, product_id=OuterRef('pk'))
    active_sq = Batch.objects.filter(outlet_id=outlet_id, is_active=True, product_id=OuterRef('pk'))
    on_order_sq = PurchaseOrderItem.objects.filter(
        product_id=OuterRef('pk'), purchase_order__outlet_id=outlet_id, purchase_order__status__in=['SENT', 'PARTIAL']
    ).values('product_id').annotate(
        s=Sum(Greatest(F('qty_strips') - F('received_qty'), Value(0), output_field=IntegerField()))).values('s')[:1]
    last = PurchaseItem.objects.filter(invoice__outlet_id=outlet_id, master_product_id=OuterRef('pk')).order_by(
        '-invoice__invoice_date', '-invoice__created_at')
    products = products.annotate(
        total_strips=Coalesce(Subquery(active_sq.values('product_id').annotate(s=Sum('qty_strips')).values('s')[:1], output_field=IntegerField()), 0),
        total_loose=Coalesce(Subquery(active_sq.values('product_id').annotate(s=Sum('qty_loose')).values('s')[:1], output_field=IntegerField()), 0),
    ).annotate(
        effective_strips=ExpressionWrapper(
            F('total_strips') + (Cast(F('total_loose'), FloatField()) / Cast(Coalesce(NullIf(F('pack_size'), 0), 1), FloatField())),
            output_field=FloatField()),
        on_order=Coalesce(Subquery(on_order_sq, output_field=IntegerField()), 0),
        outlet_min_qty=Coalesce(Subquery(config_sq.values('min_qty')[:1]), 0.0, output_field=FloatField()),
        outlet_reorder_qty=Coalesce(Subquery(config_sq.values('reorder_qty')[:1]), 0.0, output_field=FloatField()),
        last_dist_id=Subquery(last.values('invoice__distributor_id')[:1]),
        last_dist_name=Subquery(last.values('invoice__distributor__name')[:1]),
        last_purchase_rate=Subquery(last.values('purchase_rate')[:1], output_field=FloatField()),
        estimated_ptr=Coalesce(Subquery(Batch.objects.filter(outlet_id=outlet_id, product_id=OuterRef('pk')).order_by('-created_at').values('ptr')[:1]), 0.0, output_field=FloatField()),
        batch_purchase_rate=Coalesce(Subquery(Batch.objects.filter(outlet_id=outlet_id, product_id=OuterRef('pk')).order_by('-created_at').values('purchase_rate')[:1]), 0.0, output_field=FloatField()),
    ).annotate(available=ExpressionWrapper(F('effective_strips') + Cast(F('on_order'), FloatField()), output_field=FloatField()))

    low = products.filter(outlet_min_qty__gt=0, available__lte=F('outlet_min_qty'))
    if distributor_id:
        low = low.filter(last_dist_id=distributor_id)
    results = []
    for p in low[:limit]:
        lpp = float(p.last_purchase_rate) if p.last_purchase_rate and float(p.last_purchase_rate) > 0 else float(p.batch_purchase_rate or 0.0)
        if lpp <= 0.0:
            lpp = float(p.estimated_ptr) if p.estimated_ptr and float(p.estimated_ptr) > 0 else 0.0
        if lpp <= 0.0:
            lpp = float(p.mrp) if p.mrp else 0.0
        deficit = float(p.outlet_reorder_qty) - float(p.available)
        if deficit <= 0:
            deficit = float(p.outlet_reorder_qty) or (float(p.outlet_min_qty) - float(p.available))
        if deficit <= 0:
            deficit = 1
        results.append({
            'productId': str(p.id), 'productName': p.name, 'manufacturer': p.manufacturer, 'packSize': p.pack_size or 1,
            'packType': p.pack_type or 'strip', 'minQty': p.outlet_min_qty, 'reorderQty': p.outlet_reorder_qty,
            'currentStock': float(p.effective_strips) if p.effective_strips is not None else 0.0, 'onOrder': p.on_order,
            'available': float(p.available), 'deficit': float(deficit),
            'lastDistributorId': str(uuid.UUID(str(p.last_dist_id))) if p.last_dist_id else None,
            'lastDistributorName': p.last_dist_name or None, 'estimatedPtr': lpp, 'lastPurchasePrice': lpp,
        })
    return results


def sync_low_stock_into_shortbook(outlet, user=None) -> int:
    """
    Put products that are below minimum (counting what is already on order) into the Shortbook. Safe to run again and again: a product that
    already has an open row is left alone, except an untouched low-stock Pending row whose quantity is refreshed.
    (Done as a sync instead of a signal on every stock change: stock moves in dozens of places, and a sync is easy to reason about.)
    """
    added = 0
    candidates = low_stock_candidates(outlet.id)
    if not candidates:
        return 0
    open_rows = {str(r.product_id): r for r in ShortbookItem.objects.filter(outlet=outlet, status__in=ShortbookItem.OPEN_STATUSES)}   # one query, not one per product
    for c in candidates:
        qty = max(1, int(math.ceil(c['deficit'])))
        row = open_rows.get(str(c['productId']))
        if row:
            if row.status == 'PENDING' and row.source == 'low_stock' and row.qty_needed != qty:
                row.qty_needed = qty
                row.save(update_fields=['qty_needed', 'updated_at'])
            continue
        shortbook_add(outlet, c['productId'], qty, 'low_stock', user, distributor_id=c['lastDistributorId'])
        added += 1
    return added


# ───────────────────────────── lifecycle ─────────────────────────────

def _remaining(line: PurchaseOrderItem) -> int:
    return max(0, line.qty_strips - line.received_qty)


def _close(po: PurchaseOrder) -> None:
    po.closed_at = timezone.now()


def ensure_share_token(po: PurchaseOrder) -> str:
    if not po.share_token:
        po.share_token = secrets.token_urlsafe(32)
    return po.share_token


@transaction.atomic
def transition(po: PurchaseOrder, action: str, user=None, **data) -> PurchaseOrder:
    """
    The one way a PO changes state. Actions: send, mark_ordered, resend, cancel, close_short, expire. (Receiving is derived: see recompute_receipts.)
    An action the current status does not allow raises POError(409) saying why.
    """
    po = PurchaseOrder.objects.select_for_update().select_related('outlet', 'distributor').get(pk=po.pk)
    if action not in STATE_ACTIONS.get(po.status, []) and action != 'expire':
        raise POError(f'{po.po_number} is {po.status_label}: you cannot {action.replace("_", " ")} it.', 409, 'BAD_TRANSITION')
    now = timezone.now()

    if action in ('send', 'mark_ordered', 'resend'):
        if action != 'resend' and not po.items.filter(qty_strips__gt=0).exists():
            raise POError('Add at least one item before sending.', 400, 'NO_ITEMS')
        channel = 'manual' if action == 'mark_ordered' else (data.get('channel') or outlet_settings(po.outlet).po_default_channel or 'whatsapp_link')
        if channel not in dict(PurchaseOrder.SEND_CHANNEL_CHOICES):
            raise POError('Unknown send channel.', 400, 'BAD_CHANNEL')
        if action != 'resend':
            po.status = 'SENT'
            po.sent_at = now
            po.expires_at = now + timedelta(days=max(1, outlet_settings(po.outlet).po_expiry_days or 3))
            if data.get('expected_date'):
                po.expected_date = data['expected_date']
            ShortbookItem.objects.filter(po_lines__purchase_order=po, status='IN_DRAFT').update(status='ORDERED')
        po.sent_via, po.sent_by = channel, (user if getattr(user, 'pk', None) else po.sent_by)
        if channel != 'manual':
            ensure_share_token(po)
        po.version += 1
        po.save()
        event(po, 'resent' if action == 'resend' else 'sent', user, channel=channel, note=data.get('note', ''),
              expected_date=str(po.expected_date or ''))

    elif action == 'cancel':
        reason = (data.get('reason') or '').strip()
        if not reason:
            raise POError('Give a reason for cancelling.', 400, 'NO_REASON')
        for line in po.items.select_related('product', 'shortbook_item'):
            _return_to_shortbook(line, _remaining(line), user)
        po.status, po.cancelled_at, po.cancel_reason = 'CANCELLED', now, reason[:255]
        po.cancelled_by = user if getattr(user, 'pk', None) else None
        _close(po)
        po.version += 1
        po.save()
        event(po, 'cancelled', user, reason=reason)

    elif action == 'close_short':
        left = 0
        for line in po.items.select_related('product', 'shortbook_item'):
            rem = _remaining(line)
            left += rem
            _return_to_shortbook(line, rem, user)
        po.status, po.closed_short = 'COMPLETED', True
        _close(po)
        po.version += 1
        po.save()
        event(po, 'closed_short', user, returned_to_shortbook=left)

    elif action == 'expire':
        if po.status != 'SENT' or po.items.filter(received_qty__gt=0).exists():
            raise POError('Only a Sent PO with nothing received can expire.', 409, 'BAD_TRANSITION')
        for line in po.items.select_related('product', 'shortbook_item'):
            _return_to_shortbook(line, _remaining(line), user)
        po.status = 'EXPIRED'
        _close(po)
        po.version += 1
        po.save()
        event(po, 'expired', user, expired_at=str(po.expires_at or ''))
    else:
        raise POError('Unknown action.', 400, 'BAD_ACTION')
    return po


# ───────────────────────────── receiving ─────────────────────────────

def _received_by_product(po: PurchaseOrder) -> Dict[str, int]:
    count_free = outlet_settings(po.outlet).po_count_free_qty
    totals: Dict[str, int] = {}
    qs = PurchaseItem.objects.filter(invoice__purchase_order=po, invoice__status='POSTED', master_product_id__isnull=False)
    for pid, qty, free in qs.values_list('master_product_id', 'qty', 'free_qty'):
        totals[str(pid)] = totals.get(str(pid), 0) + int(qty or 0) + (int(free or 0) if count_free else 0)
    return totals


@transaction.atomic
def recompute_receipts(po: PurchaseOrder, user=None, invoice: Optional[PurchaseInvoice] = None) -> PurchaseOrder:
    """
    Make received_qty and the status follow the posted invoices linked to this PO. Idempotent, so saving or editing an invoice just calls it.
    Lines of a product are filled in order; surplus is kept on the last one. Invoice lines for products not on the PO are allowed and ignored here.
    """
    po = PurchaseOrder.objects.select_for_update().select_related('outlet').get(pk=po.pk)
    if po.status in ('SAVED', 'CANCELLED', 'EXPIRED'):
        return po
    received = _received_by_product(po)
    lines = list(po.items.select_related('product', 'shortbook_item').order_by('id'))
    by_product: Dict[str, List[PurchaseOrderItem]] = {}
    for ln in lines:
        by_product.setdefault(str(ln.product_id), []).append(ln)
    for pid, group in by_product.items():
        left = received.get(pid, 0)
        for i, ln in enumerate(group):
            give = left if i == len(group) - 1 else min(left, ln.qty_strips)
            ln.received_qty = give
            left -= give
            ln.save(update_fields=['received_qty'])

    fully = bool(lines) and all(ln.received_qty >= ln.qty_strips for ln in lines)
    any_in = any(ln.received_qty > 0 for ln in lines)
    new_status = 'COMPLETED' if fully else ('PARTIAL' if any_in else 'SENT')
    if po.closed_short and po.status == 'COMPLETED':
        new_status = 'COMPLETED'           # closed short on purpose: later invoices must not reopen it
    for ln in lines:
        if ln.shortbook_item_id and ln.received_qty >= ln.qty_strips and ln.shortbook_item.status in ('ORDERED', 'IN_DRAFT'):
            ln.shortbook_item.status = 'RECEIVED'
            ln.shortbook_item.save(update_fields=['status', 'updated_at'])
    if new_status != po.status:
        old = po.status
        po.status = new_status
        if new_status == 'COMPLETED':
            _close(po)
        elif new_status in ('SENT', 'PARTIAL'):
            po.closed_at = None
        po.version += 1
        po.save()
        event(po, 'received', user, from_status=old, to_status=new_status, invoice=getattr(invoice, 'invoice_no', ''),
              received=sum(l.received_qty for l in lines), ordered=sum(l.qty_strips for l in lines))
    elif invoice is not None:
        po.save(update_fields=['updated_at'])
        event(po, 'received', user, from_status=po.status, to_status=po.status, invoice=getattr(invoice, 'invoice_no', ''),
              received=sum(l.received_qty for l in lines), ordered=sum(l.qty_strips for l in lines))
    return po


def link_invoice_to_po(invoice: PurchaseInvoice, po_id, user=None) -> PurchaseOrder:
    """Called inside the invoice save: tie the invoice to the PO and update the PO from it, in the same transaction."""
    try:
        po = PurchaseOrder.objects.select_for_update().select_related('distributor').get(id=po_id, outlet_id=invoice.outlet_id)
    except (PurchaseOrder.DoesNotExist, ValueError, Exception):
        raise POError('That purchase order was not found.', 400, 'NO_PO')
    if po.distributor_id != invoice.distributor_id:
        raise POError(f'{po.po_number} is an order to {po.distributor.name}, but this invoice is from {invoice.distributor.name}.', 400, 'WRONG_DISTRIBUTOR')
    if po.status not in ('SENT', 'PARTIAL'):
        raise POError(f'{po.po_number} is {po.status_label}: goods can only be received against a Sent or Partial PO.', 409, 'BAD_TRANSITION')
    invoice.purchase_order = po
    invoice.save(update_fields=['purchase_order'])
    return recompute_receipts(po, user, invoice)


def open_pos_for(outlet_id, distributor_id) -> List[PurchaseOrder]:
    return list(PurchaseOrder.objects.filter(outlet_id=outlet_id, distributor_id=distributor_id, status__in=['SENT', 'PARTIAL']).order_by('-created_at'))


# ───────────────────────────── expiry ─────────────────────────────

def expire_overdue(outlet=None) -> int:
    """
    Expire Sent POs whose time is up and that received nothing. Only for outlets that turned the automatic rules on. Runs lazily whenever POs
    are read (no scheduler is configured), and from `manage.py expire_purchase_orders` for a cron.
    """
    qs = PurchaseOrder.objects.filter(status='SENT', expires_at__lt=timezone.now(), outlet__settings__po_auto_rules_enabled=True)
    if outlet is not None:
        qs = qs.filter(outlet=outlet)
    done = 0
    for po in qs[:200]:
        try:
            transition(po, 'expire', None)
            done += 1
        except POError:
            continue
    return done
