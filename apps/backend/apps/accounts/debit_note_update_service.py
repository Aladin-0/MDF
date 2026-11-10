import logging
from decimal import Decimal
from django.db import transaction
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.accounts.models import DebitNote, DebitNoteItem
from apps.inventory.models import Batch
from apps.purchases.models import PurchaseInvoice, PurchaseItem
from apps.accounts.journal_service import post_debit_note
# removed import

logger = logging.getLogger(__name__)

def _recompute_invoice_outstanding(invoice_id):
    """outstanding = max(0, grand_total - amount_paid - sum of this bill's debit notes). Order-independent."""
    from django.db.models import Sum
    try:
        inv = PurchaseInvoice.objects.select_for_update().get(id=invoice_id)
    except PurchaseInvoice.DoesNotExist:
        return
    returned = DebitNote.objects.filter(purchase_invoice_id=invoice_id).aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
    inv.outstanding = max(Decimal('0'), inv.grand_total - inv.amount_paid - returned)
    inv.save(update_fields=['outstanding'])


@transaction.atomic
def atomic_debit_note_update(debit_note_id: str, outlet_id: str, payload: dict, staff_id: str) -> DebitNote:
    """
    Updates an existing Debit Note atomically.
    Reverses old effects, recalculates server-side totals, applies new effects, and logs revision.
    """
    try:
        note = DebitNote.objects.select_for_update().get(id=debit_note_id, outlet_id=outlet_id)
    except DebitNote.DoesNotExist:
        raise ValidationError("Debit note not found.")

    # Optimistic Concurrency Control
    expected_updated_at_str = payload.get('expectedUpdatedAt')
    if expected_updated_at_str:
        expected_updated_at = parse_datetime(expected_updated_at_str)
        if expected_updated_at and expected_updated_at != note.updated_at:
            raise ValidationError(
                {"stale_edit_conflict": "This record changed since you opened it. Reload required."},
                code="stale_edit_conflict"
            )

    reason_code = payload.get('revisionReasonCode')
    reason_text = payload.get('revisionReasonText')
    if not reason_code or not reason_text:
        raise ValidationError("revisionReasonCode and revisionReasonText are mandatory for updates.")

    from apps.audit.core.registry import SnapshotBuilderRegistry
    old_snapshot = SnapshotBuilderRegistry.build_snapshot(note)

    # 1. Reverse previous stock logic
    # The original creation deducts `qty_strips`. To reverse, we add `qty_strips`.
    old_items = list(note.items.all())
    for item in old_items:
        batch = Batch.objects.select_for_update().get(id=item.batch_id)
        qty_to_restore_strips = int(item.qty)
        batch.qty_strips += qty_to_restore_strips
        batch.save(update_fields=['qty_strips'])

    from apps.inventory.services import reverse_stock_ledger_entry
    reverse_stock_ledger_entry(outlet_id, 'PURCHASE_RETURN', note)

    # (The invoice's outstanding is NOT reversed/re-applied as a +/- delta any more: creation clamps it at 0, so
    #  undoing it with `+= total` and re-applying without a clamp left the wrong balance. It is recomputed from
    #  the facts once the note has been rewritten, see _recompute_invoice_outstanding below.)
    invoice_to_recompute = note.purchase_invoice_id

    # 2. Reverse previous ledger journal
    from apps.accounts.models import JournalEntry
    from apps.accounts.services import LedgerService
    
    old_jes = JournalEntry.objects.filter(outlet_id=outlet_id, source_type='RETURN', source_id=str(note.id))
    for old_je in old_jes:
        for line in old_je.lines.all():
            LedgerService.update_balance(line.ledger.id, debit=line.credit_amount, credit=line.debit_amount)
        old_je.delete()

    # 3. Update header fields
    note.reason = payload.get('reason', note.reason)
    note.status = payload.get('status', note.status)
    
    # 4. Recreate Items & Recalculate
    note.items.all().delete()
    items_data = payload.get('items', [])
    if not items_data:
        raise ValidationError('Debit note must have at least one item.')

    ZERO_UUID = '00000000-0000-0000-0000-000000000000'
    returned_per_batch = {}
    server_computed_total = Decimal('0')
    server_computed_subtotal = Decimal('0')
    server_computed_gst = Decimal('0')

    for item_data in items_data:
        batch_id = item_data.get('batch_id')
        if not batch_id or str(batch_id) == ZERO_UUID:
            raise ValidationError(
                f"Missing batch for item '{item_data.get('product_name', '?')}'. "
                "Please select the item from a purchase invoice."
            )
        try:
            batch = Batch.objects.select_for_update().get(id=batch_id)
        except Batch.DoesNotExist:
            raise ValidationError(f"Batch not found for item '{item_data.get('product_name', '?')}' (id={batch_id}).")
        
        # Max quantity validation against original purchase invoice if available
        # Find original purchase invoice item
        original_qty = Decimal('0')
        previously_returned_qty = Decimal('0')
        pi_lines = []
        if note.purchase_invoice_id:
            # PurchaseItem links to its bill through `invoice` and carries `purchase_rate`; this used
            # `purchase_invoice_id=` / `.rate`, which do not exist, so EVERY edit of a purchase-linked note raised a
            # FieldError (not caught by `except DoesNotExist`). A batch may also appear on several lines.
            pi_lines = list(PurchaseItem.objects.filter(invoice_id=note.purchase_invoice_id, batch_id=batch.id))
            original_qty = sum((l.qty for l in pi_lines), Decimal('0'))
            if pi_lines:
                # Sum previously returned quantities for this batch on this invoice, EXCLUDING current note
                other_notes = DebitNote.objects.filter(purchase_invoice_id=note.purchase_invoice_id).exclude(id=note.id)
                from django.db.models import Sum
                agg = DebitNoteItem.objects.filter(debit_note__in=other_notes, batch_id=batch.id).aggregate(total=Sum('qty'))
                previously_returned_qty = agg['total'] or Decimal('0')
        # the cap is per BATCH across this note's lines (splitting one batch over two lines used to bypass it)
        returned_in_this_note = returned_per_batch.get(str(batch.id), Decimal('0'))

        qty_to_return_strips = Decimal(str(item_data['qty']))
        if qty_to_return_strips <= 0:
            continue

        if original_qty > 0:
            max_allowed = original_qty - previously_returned_qty - returned_in_this_note
            if qty_to_return_strips > max_allowed:
                raise ValidationError(f"Cannot return {qty_to_return_strips} strips of '{item_data.get('product_name')}'. Maximum allowed is {max_allowed}.")

        # Retrieve original rate or fallback to batch purchase_rate
        original_rate = pi_lines[0].purchase_rate if pi_lines else batch.purchase_rate
        returned_per_batch[str(batch.id)] = returned_in_this_note + qty_to_return_strips

        line_subtotal = qty_to_return_strips * original_rate
        # For simplicity, if gst_rate is needed, compute it. Assuming item_data passes gst_rate which is safe to use if it matches original.
        gst_rate = Decimal(str(item_data.get('gst_rate', batch.product.gst_rate if batch.product else 0)))
        line_gst = line_subtotal * (gst_rate / Decimal('100'))
        line_total = line_subtotal + line_gst

        server_computed_subtotal += line_subtotal
        server_computed_gst += line_gst
        server_computed_total += line_total

        DebitNoteItem.objects.create(
            debit_note=note,
            batch=batch,
            product_name=item_data.get('product_name', batch.product.name if batch.product else 'Unknown'),
            qty=qty_to_return_strips,
            rate=original_rate,
            gst_rate=gst_rate,
            total=line_total,
        )

        # 5. Apply new stock deductions
        pack_size = batch.pack_size or 1
        qty_to_return_int = int(qty_to_return_strips)

        total_available = (batch.qty_strips * pack_size) + batch.qty_loose
        total_needed = qty_to_return_int * pack_size
        if total_available < total_needed:
            raise ValidationError(
                f"Cannot return {qty_to_return_int} strips of '{item_data.get('product_name')}'. "
                f"Only {batch.qty_strips} strips + {batch.qty_loose} loose available."
            )

        batch.qty_strips -= qty_to_return_int
        while batch.qty_strips < 0 and batch.qty_loose >= pack_size:
            batch.qty_strips += 1
            batch.qty_loose -= pack_size
        if batch.qty_strips < 0:
            raise ValidationError(f"Insufficient strip stock for '{item_data.get('product_name')}' after loose conversion.")
        batch.save(update_fields=['qty_strips', 'qty_loose'])

        # Create new Stock Ledger entry
        from django.contrib.contenttypes.models import ContentType
        from apps.inventory.models import StockLedger
        from apps.inventory.services import rebuild_stock_ledger
        
        ct = ContentType.objects.get_for_model(note)
        dist_name = note.distributor.name if hasattr(note, 'distributor') and note.distributor else ''
        
        StockLedger.objects.create(
            outlet_id=outlet_id,
            product_id=batch.product_id,
            batch_id=batch.id,
            txn_type='PURCHASE_RETURN',
            txn_date=note.date,
            voucher_type='Debit Note',
            voucher_number=note.debit_note_no,
            party_name=dist_name,
            content_type=ct,
            object_id=note.id,
            batch_number=batch.batch_no,
            expiry_date=batch.expiry_date,
            qty_in=0,
            qty_out=qty_to_return_strips,
            rate=original_rate,
            value_in=0,
            value_out=qty_to_return_strips * original_rate
        )
        rebuild_stock_ledger(batch.id, note.date)

    # 6. Update Header totals
    note.subtotal = server_computed_subtotal
    note.gst_amount = server_computed_gst
    note.total_amount = server_computed_total
    note.save()

    # The note's total is now final: recompute the bill's outstanding from the facts (total - paid - ALL its
    # debit notes, never below 0, the same floor creation applies).
    if note.purchase_invoice_id:
        _recompute_invoice_outstanding(note.purchase_invoice_id)

    # 7. Post new ledger effects
    try:
        post_debit_note(note)
    except Exception as e:
        logger.error(f"Journal posting failed for updated debit note {note.id}: {e}")
        raise ValidationError(f"Accounting failure: {e}")

    # 8. Record Document Revision
    note.refresh_from_db()
    from apps.audit.core.registry import SnapshotBuilderRegistry
    new_snapshot = SnapshotBuilderRegistry.build_snapshot(note)

    from apps.audit.core.orchestrator import record_mutation
    record_mutation(
        entity=note,
        action='UPDATE',
        module='ACCOUNTS',
        old_snapshot=old_snapshot,
        new_snapshot=new_snapshot,
        reason_code=reason_code,
        reason_text=reason_text
    )

    return note
