import os
import uuid
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.test_settings')
django.setup()

from decimal import Decimal
from datetime import date
from apps.core.models import Outlet, Organization
from apps.accounts.models import Customer, Ledger, LedgerGroup, Staff
from apps.inventory.models import MasterProduct, Batch
from apps.purchases.services import atomic_purchase_save
from apps.billing.sale_services import atomic_sale_save
from apps.billing.payment_services import create_sales_return
from apps.billing.sale_return_update_service import atomic_sale_return_update

org = Organization.objects.get_or_create(name="Test Org")[0]
outlet = Outlet.objects.get_or_create(name="Test Outlet", organization=org)[0]
user = Staff.objects.filter(outlet=outlet).first()
if not user:
    user = Staff.objects.create(name="testuser", outlet=outlet, role="admin", phone="111")
    
group = LedgerGroup.objects.filter(outlet=outlet, name='Sundry Creditors').first()
if not group:
    group = LedgerGroup.objects.create(name='Sundry Creditors', outlet=outlet, nature='liability')
group_d = LedgerGroup.objects.filter(outlet=outlet, name='Sundry Debtors').first()
if not group_d:
    group_d = LedgerGroup.objects.create(name='Sundry Debtors', outlet=outlet, nature='asset')

def get_ledger(name, grp):
    l = Ledger.objects.filter(outlet=outlet, name=name).first()
    if not l:
        l = Ledger.objects.create(outlet=outlet, name=name, group=grp)
    return l

get_ledger("Purchase Account", group)
get_ledger("Sales Account", group_d)
get_ledger("Sales Return Account", group_d)
get_ledger("Cash", group)
dist_ledger = get_ledger("Test Dist Ledger 4", group)
cust_ledger = get_ledger("Test Cust Ledger 4", group_d)

prod = MasterProduct.objects.create(name="Cough Syrup 100ml 4", pack_size=100, pack_type="bottle", pack_unit="ml")

print("Created product:", prod.behavior_class)

purch_payload = {
    'outletId': str(outlet.id),
    'partyLedgerId': str(dist_ledger.id),
    'invoiceNo': f'TEST-PUR-{uuid.uuid4().hex[:8]}',
    'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
    'purchaseType': 'cash',
    'subtotal': 1000.00,
    'taxableAmount': 1000.00,
    'discountAmount': 0, 'gstAmount': 0, 'cessAmount': 0, 'roundOff': 0, 'ledgerAdjustment': 0,
    'grandTotal': 1000.00,
    'items': [{
        'masterProductId': str(prod.id),
        'batchNo': f'SYRUP-{uuid.uuid4().hex[:8]}',
        'expiryDate': '2029-12-01',
        'qty': 10,
        'freeQty': 0,
        'actualQty': 1000,
        'qtyMeasured': 1000,
        'measuredUnit': 'ml',
        'purchaseRate': 100.00,
        'mrp': 150.00,
        'totalAmount': 1000.00,
        'taxableAmount': 1000.00,
        'gstAmount': 0,
        'cess': 0,
        'discountPct': 0,
        'cashDiscountPct': 0,
        'gstRate': 0,
        'ptr': 100.0, 'pts': 100.0
    }]
}
pi = atomic_purchase_save(purch_payload, str(outlet.id), str(user.id))
batch = Batch.objects.get(batch_no=f'SYRUP-{uuid.uuid4().hex[:8]}')
print(f"After Purchase: Measured: {batch.qty_measured}, Strips: {batch.qty_strips}, Loose: {batch.qty_loose}")

sale_payload = {
    'customerId': '',
    'partyLedgerId': str(cust_ledger.id),
    'saleType': 'cash',
    'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
    'subtotal': 450.00,
    'taxableAmount': 450.00,
    'discountAmount': 0, 'gstAmount': 0, 'cessAmount': 0, 'roundOff': 0, 'ledgerAdjustment': 0,
    'grandTotal': 450.00, 'payments': [{'method': 'cash', 'amount': 450.00}],
}
sale_items = [{
    'batchId': str(batch.id),
    'qty': 3,
    'freeQty': 0,
    'actualQty': 300,
    'qtyMeasured': 300,
    'measuredUnit': 'ml',
    'mrp': 150.00,
    'saleRate': 150.00,
    'totalAmount': 450.00,
    'taxableAmount': 450.00,
    'gstAmount': 0,
    'gstRate': 0,
    'cessAmount': 0,
    'discountAmount': 0,
}]
si = atomic_sale_save(sale_payload, outlet, None, user, sale_items, {}, "", "")
batch.refresh_from_db()
print(f"After Sale: Measured: {batch.qty_measured}, Strips: {batch.qty_strips}, Loose: {batch.qty_loose}")

ret_payload = {
    'saleInvoiceId': str(si.id),
    'partyLedgerId': str(cust_ledger.id),
    'returnType': 'cash',
    'returnDate': date.today().isoformat() + 'T00:00:00Z',
    'subtotal': 150.00,
    'taxableAmount': 150.00,
    'discountAmount': 0, 'gstAmount': 0, 'cessAmount': 0, 'roundOff': 0, 'ledgerAdjustment': 0,
    'grandTotal': 150.00, 'payments': [{'method': 'cash', 'amount': 150.00}],
    'items': [{
        'saleItemId': str(si.items.first().id),
        'batchId': str(batch.id),
        'qtyReturned': 1,
        'qtyReturnedFree': 0,
        'actualQtyReturned': 100,
        'qtyMeasuredReturned': 100,
        'measuredUnit': 'ml',
        'returnRate': 150.00,
        'totalAmount': 150.00,
        'taxableAmount': 150.00,
        'gstRate': 0,
        'gstAmount': 0,
    }]
}
ret = create_sales_return(ret_payload, str(outlet.id), str(user.id))
batch.refresh_from_db()
print(f"After Return Save: Measured: {batch.qty_measured}, Strips: {batch.qty_strips}, Loose: {batch.qty_loose}")

ret_update_payload = dict(ret_payload)
ret_update_payload['revisionReasonCode'] = 'MISTAKE'
ret_update_payload['revisionReasonText'] = 'Customer returned 2'
ret_update_payload['subtotal'] = 300.00
ret_update_payload['taxableAmount'] = 300.00
ret_update_payload['grandTotal'] = 300.00
ret_update_payload['items'][0]['qtyReturned'] = 2
ret_update_payload['items'][0]['actualQtyReturned'] = 200
ret_update_payload['items'][0]['qtyMeasuredReturned'] = 200
ret_update_payload['items'][0]['totalAmount'] = 300.00
ret_update_payload['items'][0]['taxableAmount'] = 300.00

ret_updated = atomic_sale_return_update(str(ret.id), ret_update_payload, str(outlet.id), str(user.id))
batch.refresh_from_db()
print(f"After Return Update: Measured: {batch.qty_measured}, Strips: {batch.qty_strips}, Loose: {batch.qty_loose}")

print("Test complete.")
