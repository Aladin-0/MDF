"""
Is each batch's stock ledger complete and right? Finding the batches where it is not, and repairing them.

WHY THIS EXISTS (found 17 Nov 2026 on the dev database): 69% of stocked batches had NO ledger rows at all (an import that
wrote batches but not the opening balance), so the first sale or write-off drove their ledger balance below zero, and
465 active batches' ledger balance differed from the stock the batch really holds. The Stock Ledger screen showed it.

THE RULES
* The batch row is the truth about stock (billing sells from it). The ledger is repaired to agree with it; stock is never
  changed here.
* The ledger is append-only for FACTS (`qty_in`, `qty_out`, dates are never edited). A repair only ADDS rows, and may
  recompute the derived running balances (`recompute_running`), which never touches `Batch`.
  (`services.rebuild_stock_ledger` is NOT used: it overwrites the batch's stock from the ledger.)
* Quantities are compared in whole UNITS, not packs (a one-tablet gap on a 30-pack is real).
* The financial reports add up `OPENING` ledger rows as "Opening Stock" (accounts/voucher_views.py). So a repair is booked as
  an ADJUSTMENT_IN / OUT with voucher type "Ledger repair", which no report treats as opening stock: running it changes NO
  profit figure. Booking it as true OPENING stock (`book_as='opening'`) DOES change the P&L and is a decision for the owner
  and their accountant, so it is never the default (`scan()` reports the amount).
* A repair never creates a GST write-off record (`gst_record=False`).
* Idempotent: after a repair the batch classifies as OK, so a second run does nothing.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Count, Max, Min, OuterRef, Q, Subquery, Sum

from apps.inventory.models import Batch, StockLedger

REPAIR_VOUCHER = 'Ledger repair'            # adds an opening balance the import never wrote
CORRECTION_VOUCHER = 'Ledger reconciliation'  # makes the ledger agree with the batch's real stock, dated today

# classification of one batch
OK = 'OK'
EMPTY = 'EMPTY'            # no stock and no ledger: nothing to say
NO_LEDGER = 'A'            # holds stock, no ledger row at all            -> safe: add an opening balance
NO_OPENING = 'B'           # rows exist, no opening, the gap is positive   -> safe: add a backdated opening balance, recompute running
NO_OPENING_SHORT = 'B2'    # no opening, the ledger already holds MORE than the batch: stock left outside the ledger -> correction (owner's call)
MISMATCH = 'C'             # has an opening but the totals differ         -> correction (owner's call)
RUNNING_OFF = 'R'          # totals agree, stored running balances do not  -> safe: recompute
SAFE = (NO_LEDGER, NO_OPENING, RUNNING_OFF)
NEEDS_DECISION = (NO_OPENING_SHORT, MISMATCH)

LABELS = {
    OK: 'Ledger matches stock',
    NO_LEDGER: 'No ledger history (opening balance missing)',
    NO_OPENING: 'History starts without an opening balance',
    NO_OPENING_SHORT: 'Ledger holds more than the batch: stock left outside the ledger',
    MISMATCH: 'Ledger total differs from the batch stock',
    RUNNING_OFF: 'Running balance column is out of step',
}


def stock_units(b) -> int:
    return (b.qty_strips or 0) * (b.pack_size or 1) + (b.qty_loose or 0)


def packs(units, pack_size) -> Decimal:
    return (Decimal(units) / Decimal(pack_size or 1)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)


def _units(qty, pack_size) -> int:
    return int((Decimal(qty or 0) * (pack_size or 1)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def classify(stock: int, pack_size: int, rows: int, net, has_opening: bool, last_bal) -> str:
    """Pure: one batch's state from its numbers (all quantities in whole units)."""
    if not rows:
        return NO_LEDGER if stock > 0 else EMPTY
    ledger = _units(net, pack_size)
    if ledger == stock:
        return OK if _units(last_bal, pack_size) == stock else RUNNING_OFF
    if has_opening:
        return MISMATCH
    return NO_OPENING if stock - ledger > 0 else NO_OPENING_SHORT


def annotated_batches(outlet=None, include_inactive=False):
    led = StockLedger.objects.filter(batch=OuterRef('pk')).order_by().values('batch')
    qs = Batch.objects.all() if include_inactive else Batch.objects.filter(is_active=True)
    if outlet is not None:
        qs = qs.filter(outlet=outlet)
    return qs.select_related('product').annotate(
        l_rows=Subquery(led.annotate(c=Count('id')).values('c')[:1]),
        l_in=Subquery(led.annotate(s=Sum('qty_in')).values('s')[:1]),
        l_out=Subquery(led.annotate(s=Sum('qty_out')).values('s')[:1]),
        l_open=Subquery(led.filter(txn_type='OPENING').annotate(c=Count('id')).values('c')[:1]),
        l_first=Subquery(led.annotate(m=Min('txn_date')).values('m')[:1]),
        l_last=Subquery(StockLedger.objects.filter(batch=OuterRef('pk')).order_by('-txn_date', '-created_at').values('running_qty')[:1]),
    )


def classify_batch(b) -> str:
    net = Decimal(b.l_in or 0) - Decimal(b.l_out or 0)
    return classify(stock_units(b), b.pack_size or 1, b.l_rows or 0, net, bool(b.l_open), b.l_last)


@dataclass
class Gap:
    """What it takes to make the ledger agree with the batch (units, whole numbers)."""
    bucket: str
    stock_units: int
    ledger_units: int

    @property
    def diff_units(self) -> int:
        return self.stock_units - self.ledger_units


def scan(outlet=None, include_inactive=False, sample=10) -> dict:
    """Read-only: how many batches are in each state, and what a repair would add up to."""
    counts = {k: 0 for k in (OK, NO_LEDGER, NO_OPENING, NO_OPENING_SHORT, MISMATCH, RUNNING_OFF)}
    cost = {k: Decimal('0') for k in counts}
    samples = {k: [] for k in counts}
    opening_value = Decimal('0')       # what booking the safe repairs as OPENING stock would add to the P&L's "Opening Stock"
    for b in annotated_batches(outlet, include_inactive).iterator(chunk_size=2000):
        bucket = classify_batch(b)
        if bucket == EMPTY:
            continue
        counts[bucket] += 1
        net = Decimal(b.l_in or 0) - Decimal(b.l_out or 0)
        gap_packs = abs(packs(stock_units(b) - _units(net, b.pack_size or 1), b.pack_size or 1)) if bucket not in (OK, RUNNING_OFF) else Decimal('0')
        cost[bucket] += gap_packs * (b.purchase_rate or 0)
        if bucket in (NO_LEDGER, NO_OPENING):
            opening_value += gap_packs * (b.purchase_rate or 0)
        if len(samples[bucket]) < sample and bucket != OK:
            samples[bucket].append({'batchId': str(b.id), 'batchNo': b.batch_no, 'product': b.product.name if b.product else '', 'stockUnits': stock_units(b), 'ledgerUnits': _units(net, b.pack_size or 1)})
    return {
        'counts': counts,
        'labels': LABELS,
        'safeToRepair': sum(counts[k] for k in SAFE),
        'needsDecision': sum(counts[k] for k in NEEDS_DECISION),
        'costOfGap': {k: float(v.quantize(Decimal('0.01'))) for k, v in cost.items()},
        'openingStockIfBookedAsOpening': float(opening_value.quantize(Decimal('0.01'))),
        'samples': samples,
    }


def recompute_running(batch_id) -> int:
    """
    Recompute the derived `running_qty` / `running_value` of one batch's rows, in ledger order, starting from zero.
    Touches NOTHING else: not the facts on the rows, and not `Batch` stock (unlike services.rebuild_stock_ledger).
    Returns how many rows changed.
    """
    qty, value, changed = Decimal('0'), Decimal('0'), 0
    for e in StockLedger.objects.select_for_update().filter(batch_id=batch_id).order_by('txn_date', 'created_at'):
        qty += e.qty_in - e.qty_out
        value += e.qty_in * e.rate - e.qty_out * e.rate
        if e.running_qty != qty or e.running_value != value:
            StockLedger.objects.filter(pk=e.pk).update(running_qty=qty, running_value=value)
            changed += 1
    return changed


def open_if_missing(outlet, batch, packs_before, actor=None):
    """
    Call BEFORE writing a ledger row for a batch whose stock you have just changed (or are about to): if the batch has no
    ledger history, record the stock it held before this change as its opening balance, so the new row does not
    start from zero and drive the balance negative. `packs_before` = the stock BEFORE the change, in packs.
    Booked as a ledger repair (not OPENING stock), so no profit figure moves. Returns the row, or None when not needed.
    """
    from apps.inventory.services import post_stock_ledger_entry
    packs_before = Decimal(str(packs_before))
    if packs_before <= 0 or StockLedger.objects.filter(batch=batch).exists():
        return None
    return post_stock_ledger_entry(
        outlet=outlet, product=batch.product, batch=batch, txn_type='ADJUSTMENT_IN', txn_date=batch.created_at.date(),
        voucher_type=REPAIR_VOUCHER, voucher_number='OPENING-BALANCE', party_name='Opening balance recorded when the ledger was found empty',
        qty_in=packs_before, qty_out=0, rate=batch.purchase_rate or 0, source_object=None, actor=actor, gst_record=False,
    )


@dataclass
class Result:
    batch_id: str
    batch_no: str
    bucket: str
    action: str          # what was (or would be) done
    units: int = 0


def _book(book_as: str):
    return 'OPENING' if book_as == 'opening' else 'ADJUSTMENT_IN'


def repair(outlet=None, *, apply=False, corrections=False, book_as='adjustment', include_inactive=False, today=None, actor=None) -> dict:
    """
    Repair the safe buckets (A, B, R). With `corrections=True` also the ones that need the owner's decision (B2, C), as rows
    dated today. `apply=False` (the default) writes nothing and says what it would do. `book_as='opening'` books openings as
    true OPENING stock (changes the P&L's Opening Stock: see the module note).
    """
    from apps.inventory.services import post_stock_ledger_entry
    today = today or date.today()
    run = f'REPAIR-{today:%Y%m%d}'
    wanted = set(SAFE) | (set(NEEDS_DECISION) if corrections else set())
    results, skipped = [], {k: 0 for k in NEEDS_DECISION}

    for b0 in annotated_batches(outlet, include_inactive).iterator(chunk_size=500):
        bucket = classify_batch(b0)
        if bucket in (OK, EMPTY):
            continue
        if bucket not in wanted:
            skipped[bucket] += 1
            continue
        if not apply:
            net = Decimal(b0.l_in or 0) - Decimal(b0.l_out or 0)
            results.append(Result(str(b0.id), b0.batch_no, bucket, _describe(bucket, stock_units(b0) - _units(net, b0.pack_size or 1)), abs(stock_units(b0) - _units(net, b0.pack_size or 1))))
            continue
        with transaction.atomic():
            # lock the batch and look again: a sale may have changed it since the scan
            b = annotated_batches(None, True).select_for_update(of=('self',)).get(pk=b0.pk)
            bucket = classify_batch(b)
            if bucket not in wanted:
                continue
            ps = b.pack_size or 1
            net = Decimal(b.l_in or 0) - Decimal(b.l_out or 0)
            diff = stock_units(b) - _units(net, ps)
            if bucket == RUNNING_OFF:
                recompute_running(b.pk)
            elif bucket == NO_LEDGER:
                post_stock_ledger_entry(outlet=b.outlet, product=b.product, batch=b, txn_type=_book(book_as), txn_date=b.created_at.date(),
                                        voucher_type='Opening Stock' if book_as == 'opening' else REPAIR_VOUCHER, voucher_number=run,
                                        party_name='Opening balance added by ledger repair', qty_in=packs(diff, ps), qty_out=0,
                                        rate=b.purchase_rate or 0, actor=actor, gst_record=False)
            elif bucket == NO_OPENING:
                first_date = b.l_first
                first = StockLedger.objects.filter(batch=b).order_by('txn_date', 'created_at').first()
                row = StockLedger.objects.create(
                    outlet=b.outlet, product=b.product, batch=b, txn_type=_book(book_as), txn_date=min(first_date, b.created_at.date()),
                    voucher_type='Opening Stock' if book_as == 'opening' else REPAIR_VOUCHER, voucher_number=run,
                    party_name='Opening balance added by ledger repair', batch_number=b.batch_no, expiry_date=b.expiry_date,
                    qty_in=packs(diff, ps), qty_out=0, rate=b.purchase_rate or 0,
                    value_in=packs(diff, ps) * (b.purchase_rate or 0), value_out=0, running_qty=0, running_value=0, actor=actor)
                StockLedger.objects.filter(pk=row.pk).update(created_at=first.created_at - timedelta(seconds=1))   # sorts before the first real row
                recompute_running(b.pk)
            else:   # B2 / C: make the ledger agree with the batch, as a row dated today
                post_stock_ledger_entry(outlet=b.outlet, product=b.product, batch=b, txn_type='ADJUSTMENT_IN' if diff > 0 else 'ADJUSTMENT_OUT', txn_date=today,
                                        voucher_type=CORRECTION_VOUCHER, voucher_number=run,
                                        party_name='Ledger made to agree with the stock the batch holds', qty_in=packs(diff, ps) if diff > 0 else 0,
                                        qty_out=packs(-diff, ps) if diff < 0 else 0, rate=b.purchase_rate or 0, actor=actor, gst_record=False)
            results.append(Result(str(b.id), b.batch_no, bucket, _describe(bucket, diff), abs(diff)))

    by_bucket = {}
    for r in results:
        by_bucket[r.bucket] = by_bucket.get(r.bucket, 0) + 1
    return {'applied': apply, 'run': run, 'bookAs': book_as, 'repaired': by_bucket, 'total': len(results), 'leftForDecision': skipped,
            'rows': [r.__dict__ for r in results[:200]]}


def _describe(bucket, diff_units) -> str:
    return {
        NO_LEDGER: f'add an opening balance of {diff_units} unit(s)',
        NO_OPENING: f'add a backdated opening balance of {diff_units} unit(s) and recompute the running balance',
        RUNNING_OFF: 'recompute the running balance column',
    }.get(bucket, f'add a correction of {diff_units:+d} unit(s) dated today')
