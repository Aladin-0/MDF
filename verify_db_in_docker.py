import json
import sys
from decimal import Decimal
from django.test import Client
from apps.purchases.models import PurchaseInvoice
from apps.audit.models import DocumentRevisionV2
from apps.inventory.models import Batch
from apps.billing.models import LedgerEntry
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.contenttypes.models import ContentType

client = Client(HTTP_HOST="localhost")

print("Checking DB...")

purchase = PurchaseInvoice.objects.last()
if not purchase:
    print("No purchase found. DB is empty.")
    sys.exit(1)

print(f"Using PurchaseInvoice {purchase.id}")

outlet_id = purchase.outlet_id
User = get_user_model()
admin = User.objects.filter(is_superuser=True).first()
if not admin:
    from apps.accounts.models import Staff
    staff = Staff.objects.first()
    admin = staff.user

refresh = RefreshToken.for_user(admin)
auth_headers = {"HTTP_AUTHORIZATION": f"Bearer {refresh.access_token}"}

url = f"/api/v1/purchases/{purchase.id}/?outletId={outlet_id}"
resp = client.get(url, **auth_headers)
if resp.status_code != 200:
    print(f"Failed to fetch purchase: {resp.content}")
    sys.exit(1)

payload = resp.json()
print("Got purchase payload. Editing...")

first_item = payload['items'][0]
old_qty = first_item['qty']
new_qty = int(old_qty) + 10
first_item['qty'] = new_qty
pr = Decimal(str(first_item['purchaseRate']))
taxable = pr * new_qty
first_item['taxableAmount'] = str(taxable)
first_item['actualQty'] = new_qty * first_item['pkg']
gst_rate = Decimal(str(first_item['gstRate']))
gst_amount = taxable * (gst_rate / Decimal(100))
first_item['gstAmount'] = str(gst_amount)
first_item['totalAmount'] = str(taxable + gst_amount)

payload['subtotal'] = str(sum(Decimal(str(item['taxableAmount'])) for item in payload['items']))
payload['taxableAmount'] = payload['subtotal']
payload['gstAmount'] = str(sum(Decimal(str(item['gstAmount'])) for item in payload['items']))
payload['grandTotal'] = str(Decimal(payload['taxableAmount']) + Decimal(payload['gstAmount']))
payload['outstanding'] = str(Decimal(payload['grandTotal']) - Decimal(payload.get('amountPaid', '0')))

payload['revisionReasonCode'] = 'CORRECTION'
payload['revisionReasonText'] = 'Correcting qty for verification tests'

print(f"Updating quantity from {old_qty} to {new_qty}")
put_url = f"/api/v1/purchases/{purchase.id}/?outletId={outlet_id}"
put_resp = client.put(put_url, data=json.dumps(payload), content_type="application/json", **auth_headers)
if put_resp.status_code not in [200, 201]:
    print(f"Failed to update purchase: {put_resp.content}")
    sys.exit(1)

print("Update successful!")

ct = ContentType.objects.get_for_model(PurchaseInvoice)
rev = DocumentRevisionV2.objects.filter(
    content_type=ct,
    object_id=str(purchase.id)
).order_by('-created_at').first()

if not rev:
    print("DocumentRevisionV2 not found!")
    sys.exit(1)
print(f"DocumentRevisionV2 action: {rev.action}")
assert rev.action == "UPDATE"
assert rev.new_snapshot_json

purchase.refresh_from_db()
batch_id = purchase.items.first().batch_id
batch = Batch.objects.get(id=batch_id)
print(f"Batch new qty_strips: {batch.qty_strips}")

ledger_entry = LedgerEntry.objects.filter(
    distributor_id=purchase.distributor_id,
    entity_type='distributor'
).order_by('-created_at', '-id').first()

print(f"Ledger running balance: {ledger_entry.running_balance}")
print(f"Ledger credit: {ledger_entry.credit}")

audit_url = f"/api/v1/audit/revisions/purchase/{purchase.id}/?outletId={outlet_id}"
audit_resp = client.get(audit_url, **auth_headers)
if audit_resp.status_code != 200:
    print(f"Audit API failed: {audit_resp.content}")
    sys.exit(1)
audit_data = audit_resp.json()
print("Audit API returned successfully")

# Get first revision
first_revision = audit_data['revisions'][0]
print(f"Audit API latest action: {first_revision.get('revision_type')}")
if first_revision.get('revision_type') == 'UPDATE' and ('snapshot' in first_revision or 'new_snapshot_json' in first_revision):
    print("Audit API returns correct V1-like structure")
else:
    print("Audit API structure mismatch!", first_revision)
    sys.exit(1)

print("All verifications completed successfully!")
