import os
import django
import json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Voucher, JournalEntry, JournalLine
from apps.accounts.voucher_update_service import atomic_voucher_update
from apps.accounts.models import Staff
from decimal import Decimal

v = Voucher.objects.first()
outlet_id = v.outlet_id
staff = Staff.objects.filter(role='admin').first()

print(f"Target Voucher: {v.voucher_no}")

from apps.accounts.journal_service import post_voucher
post_voucher(v)

je = JournalEntry.objects.filter(source_type__iexact='VOUCHER', source_id=str(v.id)).first()
print(f"Original Journal Entry ID: {je.id}, source_type: {je.source_type}")
for jl in je.lines.all():
    print(f"  Line: Ledger {jl.ledger.name}, Dr: {jl.debit_amount}, Cr: {jl.credit_amount}")

from apps.accounts.voucher_serializers import VoucherSerializer
payload = VoucherSerializer(v).data
payload_for_update = {
    'date': payload['date'],
    'narration': payload['narration'] + " UPDATED",
    'total_amount': payload['totalAmount'] + 10,
    'payment_mode': payload['paymentMode'],
    'lines': [
        {
            'ledger_id': line['ledgerId'],
            'debit': line['debit'] + 10 if line['debit'] > 0 else 0,
            'credit': line['credit'] + 10 if line['credit'] > 0 else 0,
            'description': line['description']
        } for line in payload['lines']
    ],
    'bill_adjustments': payload['billAdjustments'],
    'revisionReasonCode': 'MODIFIED',
    'revisionReasonText': 'Changed amount for test'
}

print("Running atomic_voucher_update...")
updated_v = atomic_voucher_update(
    voucher_id=str(v.id),
    outlet_id=str(outlet_id),
    payload=payload_for_update,
    staff_id=str(staff.id)
)

print(f"Updated Voucher lines:")
for l in updated_v.lines.all():
    print(f"  Line: Ledger {l.ledger.name}, Dr: {l.debit}, Cr: {l.credit}")

print("Checking Journal Entries after update...")
jes = JournalEntry.objects.filter(source_id=str(v.id))
for je in jes:
    print(f"Journal Entry ID: {je.id}, source_type: {je.source_type}")
    for jl in je.lines.all():
        print(f"  Line: Ledger {jl.ledger.name}, Dr: {jl.debit_amount}, Cr: {jl.credit_amount}")

