import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

import json
from decimal import Decimal
from django.test import Client
from apps.purchases.models import PurchaseInvoice
from apps.audit.models import DocumentRevisionV2
from apps.inventory.models import Batch
from apps.billing.models import LedgerEntry
from apps.purchases.services import atomic_purchase_update
from django.contrib.auth import get_user_model

print("=== DB Verification ===")
purchase = PurchaseInvoice.objects.last()
if not purchase:
    print("No purchase found.")
    exit(1)

outlet_id = purchase.outlet_id
User = get_user_model()
admin = User.objects.filter(is_superuser=True).first()
if not admin:
    from apps.accounts.models import Staff
    admin = Staff.objects.first().user

client = Client()
client.force_login(admin)

url = f"/api/purchases/invoices/{purchase.id}/?outletId={outlet_id}"
resp = client.get(url)
if resp.status_code != 200:
    print(f"Failed to fetch purchase via API: {resp.content}")
    exit(1)

payload = resp.json()
first_item = payload['items'][0]
old_qty = int(first_item['qty'])
new_qty = old_qty + 1
first_item['qty'] = new_qty
first_item['actualQty'] = new_qty * int(first_item.get('pkg', 1))

pr = Decimal(str(first_item['purchaseRate']))
taxable = pr * new_qty
first_item['taxableAmount'] = str(taxable)

gst_rate = Decimal(str(first_item.get('gstRate', 0)))
gst_amount = taxable * (gst_rate / Decimal(100))
first_item['gstAmount'] = str(gst_amount)
first_item['totalAmount'] = str(taxable + gst_amount)

payload['subtotal'] = str(sum(Decimal(str(item['taxableAmount'])) for item in payload['items']))
payload['taxableAmount'] = payload['subtotal']
payload['gstAmount'] = str(sum(Decimal(str(item['gstAmount'])) for item in payload['items']))
payload['grandTotal'] = str(Decimal(payload['taxableAmount']) + Decimal(payload['gstAmount']))

payload['revisionReasonCode'] = 'CORRECTION'
payload['revisionReasonText'] = 'Verification test'

print(f"Editing first item qty from {old_qty} to {new_qty} using service directly.")
atomic_purchase_update(str(purchase.id), payload, str(outlet_id), str(admin.id))

print("Edit successful.")

# Re-fetch DB objects
purchase.refresh_from_db()
batch = Batch.objects.get(id=first_item['batchId'])
ledger_entry = LedgerEntry.objects.filter(entity_type='distributor', reference_no=purchase.invoice_no).last()
rev = DocumentRevisionV2.objects.filter(content_type__model='purchaseinvoice', object_id=str(purchase.id)).order_by('-created_at').first()

print("--- DocumentRevisionV2 ---")
print(f"Action: {rev.action}")
print(f"Module: {rev.module}")
print(f"Reason Code: {rev.reason_code}")
print(f"Changes/Payload exists: {'payload' in rev.metadata}")

print("--- Batch ---")
print(f"Batch Qty Strips: {batch.qty_strips}")

print("--- LedgerEntry ---")
print(f"Running Balance: {ledger_entry.running_balance if ledger_entry else 'None'}")

print("\n=== API Verification ===")
hist_url = f"/api/audit/revisions/purchase/{purchase.id}/?outletId={outlet_id}"
hist_resp = client.get(hist_url)
print(f"Status Code: {hist_resp.status_code}")
if hist_resp.status_code == 200:
    hist_data = hist_resp.json()
    print("Record keys:", list(hist_data.get('record', {}).keys()))
    if hist_data.get('revisions'):
        first_rev = hist_data['revisions'][0]
        print("First Revision Action:", first_rev.get('action'))
        print("First Revision Reason Code:", first_rev.get('reason_code'))
        print("First Revision Changes:", "Present" if 'changes' in first_rev else "Missing")
    else:
        print("No revisions found in API.")
else:
    print(f"History API Error: {hist_resp.content}")

