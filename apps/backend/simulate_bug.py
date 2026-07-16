import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

import json
import uuid
from decimal import Decimal
from datetime import date
from django.db import transaction
from apps.core.models import Outlet
from apps.accounts.models import Staff
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.purchases.models import PurchaseInvoice, Distributor

from apps.purchases.services import atomic_purchase_save, atomic_purchase_update
from apps.inventory.services import post_stock_ledger_entry, rebuild_stock_ledger

staff = Staff.objects.first()
outlet = staff.outlet
distributor = Distributor.objects.filter(outlet=outlet).first()
product = MasterProduct.objects.filter(name__icontains="Citrezen").first()
if not product:
    product = MasterProduct.objects.create(name="Citrezen", mrp=150.0, default_sale_rate=120.0, pack_size=10)

inv_prefix = uuid.uuid4().hex[:6].upper()

purchase_payload = {
    'outletId': str(outlet.id),
    'partyLedgerId': str(distributor.ledgers.first().id) if distributor.ledgers.exists() else None,
    'invoiceNo': f'PUR-{inv_prefix}',
    'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
    'dueDate': date.today().isoformat() + 'T00:00:00Z',
    'purchaseType': 'credit',
    'subtotal': 1000.0,
    'discountAmount': 0.0,
    'taxableAmount': 1000.0,
    'gstAmount': 0.0,
    'cessAmount': 0.0,
    'grandTotal': 1000.0,
    'items': [{
        'masterProductId': str(product.id),
        'batchNo': f'BTC78-{inv_prefix}',
        'expiryDate': '2026-12-31T00:00:00Z',
        'qty': 10,
        'actualQty': 10,
        'purchaseRate': 100.0,
        'mrp': 150.0,
        'saleRate': 120.0,
        'taxableAmount': 1000.0,
        'gstAmount': 0.0,
        'totalAmount': 1000.0,
        'ptr': 100.0,
        'pts': 90.0
    }]
}

purchase = atomic_purchase_save(purchase_payload, str(outlet.id), str(staff.id))
batch = Batch.objects.filter(batch_no=f'BTC78-{inv_prefix}', product=product).last()

batch.qty_strips -= 4
batch.save()
with transaction.atomic():
    post_stock_ledger_entry(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type='SALE_OUT',
        txn_date=date.today(),
        voucher_type='Sale Invoice',
        voucher_number=f'SAL-{inv_prefix}',
        party_name='Patient',
        qty_in=0,
        qty_out=4,
        rate=120.0
    )
rebuild_stock_ledger(str(batch.id), date.today())
batch.refresh_from_db()

print("=== DB VALUES BEFORE EDIT ===")
stock_entries = list(StockLedger.objects.filter(batch=batch).order_by('txn_date', 'created_at'))
for se in stock_entries:
    print(f"  {se.txn_type}: qty_in={se.qty_in} qty_out={se.qty_out} balance={se.running_qty}")
print(f"  Batch BTC78 qty BEFORE edit: {batch.qty_strips}")

purchase_payload['items'][0]['qty'] = 20
purchase_payload['items'][0]['actualQty'] = 20
purchase_payload['items'][0]['taxableAmount'] = 2000.0
purchase_payload['items'][0]['totalAmount'] = 2000.0
purchase_payload['subtotal'] = 2000.0
purchase_payload['taxableAmount'] = 2000.0
purchase_payload['grandTotal'] = 2000.0
purchase_payload['revisionReasonCode'] = 'CORRECTION'
purchase_payload['revisionReasonText'] = 'Testing BTC78'

atomic_purchase_update(str(purchase.id), purchase_payload, str(outlet.id), str(staff.id))

batch.refresh_from_db()
print("=== DB VALUES AFTER EDIT ===")
print(f"Batch BTC78 qty after edit: {batch.qty_strips}")
stock_entries_after = list(StockLedger.objects.filter(batch=batch).order_by('txn_date', 'created_at'))
purchased = sum(se.qty_in for se in stock_entries_after if se.txn_type == 'PURCHASE_IN')
sold = sum(se.qty_out for se in stock_entries_after if se.txn_type == 'SALE_OUT')
print(f"  Purchased (sum of in): {purchased}")
print(f"  Sold (sum of out): {sold}")
for se in stock_entries_after:
    print(f"  {se.txn_type}: qty_in={se.qty_in} qty_out={se.qty_out} balance={se.running_qty}")
