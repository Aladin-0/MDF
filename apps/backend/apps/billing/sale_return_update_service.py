import logging
from decimal import Decimal
from django.db import transaction
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.billing.models import SalesReturn, SalesReturnItem, SaleItem, LedgerEntry
from apps.inventory.services import reverse_stock_ledger_entry, post_stock_ledger_entry
from apps.accounts.models import Staff
# removed AuditOrchestrator import

logger = logging.getLogger(__name__)

def _last_ledger_balance(outlet, customer):
    last = LedgerEntry.objects.filter(outlet=outlet, entity_type='customer', customer=customer).order_by('-id').first()
    return last.running_balance if last else Decimal('0')

@transaction.atomic
def atomic_sale_return_update(return_id: str, payload: dict, outlet_id: str, updated_by_id: str) -> SalesReturn:
    """
    Update an existing SalesReturn.
    Reverses old effects, recalculates server-side totals, applies new effects, and logs revision.
    """
    sales_return = SalesReturn.objects.select_for_update().get(id=return_id, outlet_id=outlet_id)

    # Optimistic Concurrency Control
    expected_updated_at_str = payload.get('expectedUpdatedAt')
    if expected_updated_at_str:
        expected_updated_at = parse_datetime(expected_updated_at_str)
        if expected_updated_at and expected_updated_at != sales_return.updated_at:
            raise ValidationError(
                {"stale_edit_conflict": "This record changed since you opened it. Reload required."},
                code="stale_edit_conflict"
            )

    staff = Staff.objects.filter(id=updated_by_id).first()
    is_settled = sales_return.refund_mode in ('cash', 'upi')
    if is_settled:
        if not staff or (staff.role not in ('admin', 'super_admin') and not staff.can_modify_settled_returns):
            raise ValidationError("Cannot modify a settled sale return. Missing permission.")

    reason_code = payload.get('revisionReasonCode')
    reason_text = payload.get('revisionReasonText')
    if not reason_code or not reason_text:
        raise ValidationError("revisionReasonCode and revisionReasonText are mandatory for updates.")

    outlet = sales_return.outlet
    original_sale = sales_return.original_sale

    # 1. Take BEFORE snapshot
    from apps.audit.core.registry import SnapshotBuilderRegistry
    old_snapshot = SnapshotBuilderRegistry.build_snapshot(sales_return)

    # 2. Reverse OLD effects
    old_items = list(sales_return.items.all())
    for item in old_items:
        # Reverse stock ledger entry
        reverse_stock_ledger_entry(
            outlet=outlet,
            txn_type='SALE_RETURN',
            source_object=sales_return,
            product=item.batch.product if item.batch else None,
            batch=item.batch
        )

        # Reverse stock physical quantities
        batch = item.batch
        if batch:
            batch.refresh_from_db()
            pack_size = getattr(item.original_sale_item, 'pack_size', batch.pack_size)
            batch.qty_loose -= item.qty_returned
            while batch.qty_loose < 0:
                batch.qty_strips -= 1
                batch.qty_loose += pack_size
            batch.save(update_fields=['qty_strips', 'qty_loose'])

        # Reverse qty_returned on original sale item
        sale_item = item.original_sale_item
        if sale_item:
            sale_item.qty_returned = max(0, sale_item.qty_returned - item.qty_returned)
            sale_item.save(update_fields=['qty_returned'])

    # Reverse Customer Ledger
    if sales_return.refund_mode == 'credit_note' and original_sale.customer:
        customer = original_sale.customer
        customer.outstanding += sales_return.total_amount
        customer.save(update_fields=['outstanding'])
        LedgerEntry.objects.filter(
            outlet=outlet, entity_type='customer', customer=customer,
            entry_type='credit_note', reference_no=sales_return.return_no
        ).delete()

    sales_return.items.all().delete()

    # 3. Apply NEW effects & Recalculate Totals
    new_refund_mode = payload.get('refundMode', sales_return.refund_mode)
    items_payload = payload.get('items', [])
    new_items_to_create = []
    
    server_computed_total = Decimal('0')

    for item_data in items_payload:
        sale_item = SaleItem.objects.select_for_update().get(id=item_data['originalSaleItemId'], invoice__outlet=outlet)
        batch = sale_item.batch
        qty_to_return = int(item_data['qtyReturned'])

        if qty_to_return <= 0:
            continue
            
        pack_size = getattr(sale_item, 'pack_size', batch.pack_size)

        # Max quantity validation
        # original_qty is loose units: (qty_strips * pack_size) + qty_loose
        original_sold_loose = (sale_item.qty_strips * pack_size) + sale_item.qty_loose
        
        # Determine total previously returned excluding this return
        # Since we already reversed this return's quantities above, sale_item.qty_returned 
        # now accurately reflects the sum of all OTHER returns.
        max_allowed = original_sold_loose - sale_item.qty_returned
        
        if qty_to_return > max_allowed:
            raise ValidationError(f"Cannot return {qty_to_return} of {sale_item.product_name}. Maximum allowed is {max_allowed}.")

        # Recalculate line total using original rate
        # sale_item.rate is per loose unit (per tablet, etc)
        # Note: In Mediflow SaleItem, if sale_rate is per strip, rate = sale_rate / pack_size. We use sale_item.rate.
        line_total = Decimal(str(qty_to_return)) * sale_item.rate
        server_computed_total += line_total

        new_items_to_create.append(SalesReturnItem(
            sales_return=sales_return,
            original_sale_item=sale_item,
            batch=batch,
            product_name=sale_item.product_name,
            batch_no=sale_item.batch_no,
            qty_returned=qty_to_return,
            return_rate=sale_item.rate,
            total_amount=line_total
        ))

        # Add to stock
        batch.qty_loose += qty_to_return
        while batch.qty_loose >= pack_size:
            batch.qty_strips += 1
            batch.qty_loose -= pack_size
        batch.save(update_fields=['qty_strips', 'qty_loose'])

        # Update original sale item
        sale_item.qty_returned += qty_to_return
        sale_item.save(update_fields=['qty_returned'])

    SalesReturnItem.objects.bulk_create(new_items_to_create)

    # 4. Post NEW stock ledger entries
    customer_name = original_sale.customer.name if original_sale.customer else 'Walk-in'
    for item in new_items_to_create:
        pack_size = getattr(item.original_sale_item, 'pack_size', item.batch.pack_size)
        returned_in_strips = Decimal(str(item.qty_returned)) / Decimal(str(pack_size))
        post_stock_ledger_entry(
            outlet=outlet, product=item.batch.product, batch=item.batch,
            txn_type='SALE_RETURN', txn_date=sales_return.return_date,
            voucher_type='Sale Return', voucher_number=sales_return.return_no,
            party_name=customer_name, qty_in=returned_in_strips, qty_out=0,
            rate=item.return_rate, source_object=sales_return,
        )

    # 5. Handle NEW credit note
    if new_refund_mode == 'credit_note' and original_sale.customer:
        customer = original_sale.customer
        customer.outstanding = customer.outstanding - server_computed_total
        customer.save(update_fields=['outstanding'])

        prev_balance = _last_ledger_balance(outlet, customer=customer)
        LedgerEntry.objects.create(
            outlet=outlet, entity_type='customer', customer=customer,
            date=sales_return.return_date, entry_type='credit_note',
            reference_no=sales_return.return_no,
            description=f"Sales return {sales_return.return_no} - credit note",
            debit=Decimal('0'), credit=server_computed_total,
            running_balance=prev_balance - server_computed_total,
        )

    # 6. Update Header
    sales_return.total_amount = server_computed_total
    sales_return.refund_mode = new_refund_mode
    sales_return.reason = payload.get('reason', sales_return.reason)
    sales_return.save(update_fields=['total_amount', 'refund_mode', 'reason'])

    # Fetch fresh for snapshot
    sales_return.refresh_from_db()
    from apps.audit.core.registry import SnapshotBuilderRegistry
    new_snapshot = SnapshotBuilderRegistry.build_snapshot(sales_return)

    from apps.audit.core.orchestrator import record_mutation
    record_mutation(
        entity=sales_return,
        action='UPDATE',
        module='BILLING',
        old_snapshot=old_snapshot,
        new_snapshot=new_snapshot,
        reason_code=reason_code,
        reason_text=reason_text
    )

    logger.info(f"SalesReturn {sales_return.return_no} updated: ₹{server_computed_total}")
    return sales_return
