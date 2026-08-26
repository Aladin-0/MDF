from django.db import transaction
from django.contrib.contenttypes.models import ContentType
from decimal import Decimal
from .models import StockLedger, Batch, StockAdjustment, StockAdjustmentAllocation
from apps.purchases.models import PurchaseItem


def post_stock_ledger_entry(
    outlet,
    product,
    batch,
    txn_type,          # 'PURCHASE_IN', 'SALE_OUT', etc.
    txn_date,
    voucher_type,
    voucher_number,
    party_name,
    qty_in,
    qty_out,
    rate,
    source_object=None,
    actor=None,
):
    """
    Append-only. Call inside transaction.atomic() from purchase/sale services.
    Computes running_qty using select_for_update() to prevent race conditions.
    """
    qty_in  = Decimal(str(qty_in))
    qty_out = Decimal(str(qty_out))
    rate    = Decimal(str(rate))

    # Lock last row for this outlet+product+batch to get correct running balance
    last_row = (
        StockLedger.objects
        .filter(outlet=outlet, product=product, batch=batch)
        .select_for_update()
        .order_by('-txn_date', '-created_at')
        .first()
    )

    prior_qty   = last_row.running_qty   if last_row else Decimal('0')
    prior_value = last_row.running_value if last_row else Decimal('0')

    new_running_qty   = prior_qty   + qty_in  - qty_out
    new_running_value = prior_value + (qty_in * rate) - (qty_out * rate)

    # Prepare GenericFK fields
    content_type = None
    object_id    = None
    if source_object is not None:
        content_type = ContentType.objects.get_for_model(source_object)
        object_id    = source_object.pk

    batch_number = batch.batch_no if batch else ''
    expiry_date  = batch.expiry_date  if batch else None

    entry = StockLedger.objects.create(
        outlet         = outlet,
        product        = product,
        batch          = batch,
        txn_type       = txn_type,
        txn_date       = txn_date,
        voucher_type   = voucher_type,
        voucher_number = str(voucher_number),
        party_name     = str(party_name),
        content_type   = content_type,
        object_id      = object_id,
        batch_number   = batch_number,
        expiry_date    = expiry_date,
        qty_in         = qty_in,
        qty_out        = qty_out,
        rate           = rate,
        value_in       = qty_in  * rate,
        value_out      = qty_out * rate,
        running_qty    = new_running_qty,
        running_value  = new_running_value,
        actor          = actor,
    )

    if txn_type == 'ADJUSTMENT_OUT':
        _auto_create_stock_adjustment(entry)

    return entry

def _auto_create_stock_adjustment(entry):
    batch = entry.batch
    if not batch:
        return
    
    qty_out_loose = entry.qty_out
    pack_size = batch.pack_size or 1
    qty_strips = int(qty_out_loose // pack_size)
    qty_loose = int(qty_out_loose % pack_size)

    with transaction.atomic():
        adj = StockAdjustment.objects.create(
            outlet=entry.outlet,
            batch=batch,
            source_ledger_entry=entry,
            adjustment_type='EXPIRED',
            qty_strips=qty_strips,
            qty_loose=qty_loose,
            status='PROPOSED',
            traceability_status='NEEDS_REVIEW',
            effective_date=entry.txn_date,
            reason="Auto-generated from StockLedger ADJUSTMENT_OUT"
        )

        pis = list(PurchaseItem.objects.filter(batch=batch).select_for_update().select_related('invoice', 'invoice__distributor', 'invoice__outlet').order_by('invoice__invoice_date', 'created_at'))
        total_pi_qty = sum(Decimal(str(pi.actual_qty)) for pi in pis)

        prior_qty = entry.running_qty + entry.qty_out
        total_consumed_before = total_pi_qty - prior_qty

        if total_consumed_before < 0 or total_pi_qty < prior_qty:
            return
        
        remaining_to_allocate = Decimal(str(qty_out_loose))
        allocations = []
        current_consumed = Decimal(str(total_consumed_before))

        for pi in pis:
            pi_qty = Decimal(str(pi.actual_qty))
            if current_consumed >= pi_qty:
                current_consumed -= pi_qty
                continue
            
            available_in_pi = pi_qty - current_consumed
            current_consumed = Decimal('0')

            alloc_qty = min(remaining_to_allocate, available_in_pi)
            if alloc_qty <= 0:
                break
            
            proportion = alloc_qty / pi_qty
            
            is_inter_state = False
            if pi.invoice.distributor and pi.invoice.outlet:
                is_inter_state = (pi.invoice.distributor.state.strip().lower() != pi.invoice.outlet.state.strip().lower())

            reversed_gst = pi.gst_amount * proportion
            reversed_igst = reversed_gst if is_inter_state else Decimal('0')
            reversed_cgst = (reversed_gst / 2) if not is_inter_state else Decimal('0')
            reversed_sgst = (reversed_gst / 2) if not is_inter_state else Decimal('0')
            reversed_cess = pi.cess_amount * proportion
            taxable_value = pi.taxable_amount * proportion

            allocations.append(StockAdjustmentAllocation(
                stock_adjustment=adj,
                source_purchase_item=pi,
                allocated_qty=alloc_qty,
                taxable_value=taxable_value,
                reversed_igst_amount=reversed_igst,
                reversed_cgst_amount=reversed_cgst,
                reversed_sgst_amount=reversed_sgst,
                reversed_cess_amount=reversed_cess,
                allocation_order=len(allocations)
            ))
            
            remaining_to_allocate -= alloc_qty
            if remaining_to_allocate <= 0:
                break
        
        if remaining_to_allocate > 0:
            return
        
        StockAdjustmentAllocation.objects.bulk_create(allocations)
        adj.traceability_status = 'FIFO_MATCHED'
        adj.save()



def rebuild_stock_ledger(batch_id: str, from_date):
    """
    Recalculate running_qty and running_value for a batch from a specific date forward.
    This is necessary when historical stock ledger entries are deleted or modified.
    """
    entries = StockLedger.objects.filter(
        batch_id=batch_id,
        txn_date__gte=from_date
    ).order_by('txn_date', 'created_at')

    # Get the last entry before the from_date
    prev = StockLedger.objects.filter(
        batch_id=batch_id,
        txn_date__lt=from_date
    ).order_by('-txn_date', '-created_at').first()

    running_qty = prev.running_qty if prev else Decimal('0')
    running_value = prev.running_value if prev else Decimal('0')

    for entry in entries:
        running_qty = running_qty + entry.qty_in - entry.qty_out
        running_value = running_value + (entry.qty_in * entry.rate) - (entry.qty_out * entry.rate)
        StockLedger.objects.filter(pk=entry.pk).update(
            running_qty=running_qty,
            running_value=running_value
        )
    
    print(f"DEBUG rebuild_stock_ledger: batch_id={batch_id}, from_date={from_date}")
    print(f"DEBUG prev={prev.pk if prev else None}, prev_qty={prev.running_qty if prev else 'N/A'}")
    print(f"DEBUG entries={[f'{e.pk}:{e.txn_type}:in={e.qty_in}:out={e.qty_out}' for e in entries]}")
    print(f"DEBUG final running_qty={running_qty}")

    # Step 3: Update Batch master
    batch = Batch.objects.filter(pk=batch_id).first()
    if batch:
        pack_size = batch.pack_size or 1
        total_loose = int(running_qty * pack_size)
        qty_strips = total_loose // pack_size
        qty_loose = total_loose % pack_size
        Batch.objects.filter(pk=batch_id).update(qty_strips=qty_strips, qty_loose=qty_loose)

def reverse_stock_ledger_entry(outlet, txn_type, source_object, product=None, batch=None):
    """
    Deletes stock ledger entries for a given source object and rebuilds the stock ledger.
    """
    content_type = ContentType.objects.get_for_model(source_object)
    
    entries = StockLedger.objects.filter(
        outlet=outlet,
        content_type=content_type,
        object_id=source_object.pk,
        txn_type=txn_type
    )
    
    if product:
        entries = entries.filter(product=product)
    if batch:
        entries = entries.filter(batch=batch)
        
    entries_to_delete = list(entries)
    if not entries_to_delete:
        return
        
    # Get the earliest date and batch to rebuild
    min_date = min(e.txn_date for e in entries_to_delete)
    batch_ids = set(e.batch_id for e in entries_to_delete if e.batch_id)
    
    entries.delete()
    
    for b_id in batch_ids:
        rebuild_stock_ledger(b_id, min_date)
