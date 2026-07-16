import os
import django
import json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Voucher, VoucherBillAdjustment, JournalEntry
from apps.billing.models import SaleInvoice
from apps.accounts.voucher_update_service import atomic_voucher_update
from decimal import Decimal
from apps.audit.models import DocumentRevisionV2
from django.contrib.contenttypes.models import ContentType
from apps.accounts.models import Staff

staff = Staff.objects.filter(role='admin').first()
if not staff:
    staff = Staff.objects.create(role='admin', user_id=1, outlet_id=1) # hack if doesn't exist, though it should

vba = VoucherBillAdjustment.objects.filter(sale_invoice__isnull=False).first()
v = vba.voucher
inv = vba.sale_invoice
adj_amount = vba.adjusted_amount
outlet_id = v.outlet_id

print(f"Target Voucher: {v.voucher_no}")
print(f"Target Invoice: {inv.invoice_no}")
print(f"Invoice amount_due BEFORE: {inv.amount_due}")

if inv.customer:
    print(f"Customer outstanding BEFORE: {inv.customer.outstanding}")
else:
    print("Customer: None")

journal_count_before = JournalEntry.objects.filter(source_type='voucher', source_id=str(v.id)).count()
print(f"Journal Entries BEFORE: {journal_count_before}")

from apps.accounts.voucher_serializers import VoucherSerializer
payload = VoucherSerializer(v).data

payload_for_update = {
    'date': payload['date'],
    'narration': payload['narration'],
    'total_amount': payload['totalAmount'],
    'payment_mode': payload['paymentMode'],
    'lines': [
        {
            'ledger_id': line['ledgerId'],
            'debit': line['debit'],
            'credit': line['credit'],
            'description': line['description']
        } for line in payload['lines']
    ],
    'bill_adjustments': [], # Unlinked!
    'revisionReasonCode': 'UNLINKED_INVOICE',
    'revisionReasonText': 'Unlinked an invoice manually via API'
}

print("Running atomic_voucher_update...")
try:
    updated_v = atomic_voucher_update(
        voucher_id=str(v.id),
        outlet_id=str(outlet_id),
        payload=payload_for_update,
        staff_id=str(staff.id)
    )
    print("Save successful with no 500 error!")
except Exception as e:
    print(f"Update failed with: {e}")
    exit(1)

inv.refresh_from_db()
print(f"Invoice amount_due AFTER: {inv.amount_due}")
# The amount_due was previously decreased by adj_amount. Reverting means increasing by adj_amount.
# Wait, my logic earlier might be wrong. When you edit a voucher to remove the bill adjustment,
# the code reverses the OLD bill adjustments (which restores the invoice's amount_due),
# then processes the new ones (none here).
# Let's see what happens.

if inv.customer:
    inv.customer.refresh_from_db()
    print(f"Customer outstanding AFTER: {inv.customer.outstanding}")

journal_count_after = JournalEntry.objects.filter(source_type='voucher', source_id=str(v.id)).count()
print(f"Journal Entries AFTER: {journal_count_after}")

ct = ContentType.objects.get_for_model(Voucher)
revs = DocumentRevisionV2.objects.filter(content_type=ct, object_id=str(v.id))
if revs.exists():
    rev = revs.order_by('-created_at').first()
    print(f"DocumentRevisionV2 exists: ID {rev.id}")
    print(f"Reason: {rev.reason_code} - {rev.reason_text}")
    print(f"Action: {rev.action}")
else:
    print("-> No DocumentRevisionV2 row found!")
