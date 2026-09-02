import os
import sys
import django
from datetime import date
from decimal import Decimal
from django.core.exceptions import ValidationError

import warnings
warnings.filterwarnings('ignore')

print("=== STARTING PHASE A1 DEMONSTRATION ===")

from apps.inventory.models import Batch, StockLedger, StockAdjustment, StockAdjustmentAllocation
from apps.purchases.models import PurchaseItem
from apps.inventory.services import post_stock_ledger_entry
from apps.reports.gstr_builders import GSTR3BBuilder

from django.db import transaction
from apps.purchases.models import PurchaseInvoice

with transaction.atomic():
    # 1. Select a known seeded batch with a traceable PurchaseItem.
    pi = PurchaseItem.objects.select_related('batch', 'batch__outlet', 'batch__product').first()
    if not pi:
        print("No PurchaseItem found! Exiting.")
        sys.exit(1)

    # Clone the batch to have a clean ledger
    batch = pi.batch
    batch.pk = None
    batch.batch_no = "DEMO-BATCH-001"
    batch.save()
    
    outlet = batch.outlet
    product = batch.product
    
    # Clone the PI
    pi.pk = None
    pi.batch = batch
    pi.actual_qty = Decimal('500.000')
    pi.save()

    print(f"\n[1] Selected Batch for Demonstration:")
    print(f"Batch No: {batch.batch_no} | Product: {product.name} | Outlet: {outlet.name}")
    print(f"Original Purchase Qty: {pi.actual_qty} | GST: {pi.gst_amount} | CESS: {pi.cess_amount}")

    # Force a PURCHASE_IN ledger entry so there's traceable stock in the ledger
    post_stock_ledger_entry(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type='PURCHASE_IN',
        txn_date=date(2026, 8, 1),
        voucher_type='Purchase',
        voucher_number='DEMO-PUR-001',
        party_name='Demo Supplier',
        qty_in=Decimal('500.000'),
        qty_out=Decimal('0'),
        rate=batch.purchase_rate
    )

# 2. Create a small partial stock adjustment with reason EXPIRED.
print(f"\n[2] Creating an ADJUSTMENT_OUT StockLedger entry for 5 units (EXPIRED)...")

qty_to_expire = Decimal('5.000')

with transaction.atomic():
    entry = post_stock_ledger_entry(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type='ADJUSTMENT_OUT',
        txn_date=date(2026, 8, 14),
        voucher_type='Adjustment',
        voucher_number='DEMO-ADJ-001',
        party_name='Self',
        qty_in=Decimal('0'),
        qty_out=qty_to_expire,
        rate=batch.purchase_rate
    )

# 3. Show resulting entities
print(f"\n[3] Showing Generated Entries:")
print(f"StockLedger ID: {entry.id}")
print(f"  Txn Type: {entry.txn_type}")
print(f"  Qty Out: {entry.qty_out}")
print(f"  Running Qty: {entry.running_qty}")

adj = StockAdjustment.objects.get(source_ledger_entry=entry)
print(f"\nStockAdjustment ID: {adj.id}")
print(f"  Type: {adj.adjustment_type}")
print(f"  Status: {adj.status}")
print(f"  Traceability: {adj.traceability_status}")
print(f"  Qty (Strips/Loose): {adj.qty_strips}/{adj.qty_loose}")

allocations = list(adj.allocations.all())
print(f"\nStockAdjustmentAllocations (Count: {len(allocations)}):")
for alloc in allocations:
    print(f"  ID: {alloc.id}")
    print(f"  Source PurchaseItem ID: {alloc.source_purchase_item_id}")
    print(f"  Allocated Qty: {alloc.allocated_qty}")
    print(f"  Taxable Value: {alloc.taxable_value}")
    print(f"  Reversed CGST: {alloc.reversed_cgst_amount}")
    print(f"  Reversed SGST: {alloc.reversed_sgst_amount}")
    print(f"  Reversed IGST: {alloc.reversed_igst_amount}")
    print(f"  Reversed CESS: {alloc.reversed_cess_amount}")

# 4. Confirm it starts in PROPOSED and doesn't affect GSTR-3B
print(f"\n[4] Confirming PROPOSED status doesn't affect GSTR-3B:")
builder = GSTR3BBuilder(gstin=outlet.gstin, period="082026")
data_proposed = builder.generate_json()
itc_rev_proposed = next((item for item in data_proposed["itc_elg"]["itc_rev"] if item["ty"] == "SECTION_17_5_H"), None)
print(f"GSTR-3B SECTION_17_5_H Values (PROPOSED): {itc_rev_proposed}")
# The builder might return 0s if none are approved, or empty.

# 5. Approve it
print(f"\n[5] Approving the StockAdjustment...")
adj.status = 'APPROVED'
adj.save()
print(f"StockAdjustment Status updated to: {adj.status}")

# 6. Generate relevant GSTR-3B draft JSON
print(f"\n[6] Confirming APPROVED status updates GSTR-3B:")
data_approved = builder.generate_json()
itc_rev_approved = next((item for item in data_approved["itc_elg"]["itc_rev"] if item["ty"] == "SECTION_17_5_H"), None)
print(f"GSTR-3B SECTION_17_5_H Values (APPROVED): {itc_rev_approved}")

# 7. Mark INCLUDED_IN_EXPORT
print(f"\n[7] Marking INCLUDED_IN_EXPORT...")
adj.status = 'INCLUDED_IN_EXPORT'
adj.save()
print(f"StockAdjustment Status updated to: {adj.status}")

# 8. Attempt to edit it
print(f"\n[8] Attempting to modify an exported adjustment...")
try:
    adj.qty_loose = 999
    adj.save()
    print("ERROR: Modification succeeded! Immutability failed.")
except ValidationError as e:
    print(f"SUCCESS: Immutability protection triggered! ValidationError: {e.messages[0]}")

# 9. Confirm no direct GST filing
print(f"\n[9] Confirmation:")
print("No direct GST filing, submission, offset, or EVC action occurs at any point.")
print("=== END OF DEMONSTRATION ===")
