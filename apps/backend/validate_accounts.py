import sys
import os
import django
import uuid
from decimal import Decimal
from datetime import datetime

# Setup Django
sys.path.append('/home/asta/coding/MDF/apps/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.accounts.models import Voucher, Ledger, Staff, JournalEntry, JournalLine
from apps.core.models import Outlet
from apps.accounts.services import VoucherService, LedgerService
from apps.accounts.voucher_update_service import atomic_voucher_update
from rest_framework.exceptions import ValidationError

print("=== Starting Accounts Dashboard Validation ===")

# Get or create outlet and staff
outlet = Outlet.objects.first()
if not outlet:
    outlet = Outlet.objects.create(name="Test Outlet", db_name="test_db")

staff = Staff.objects.first()
if not staff:
    staff = Staff.objects.create(name="Admin", role="admin", outlet_id=outlet.id)

print(f"Using Outlet: {outlet.id} and Staff: {staff.id}")

# Setup basic ledgers
try:
    cash_group = Ledger.objects.filter(group__name="Cash in Hand").first().group_id if Ledger.objects.filter(group__name="Cash in Hand").exists() else None
    party_group = Ledger.objects.filter(group__name="Sundry Debtors").first().group_id if Ledger.objects.filter(group__name="Sundry Debtors").exists() else None
except Exception:
    cash_group = None
    party_group = None

try:
    cash_ledger = Ledger.objects.filter(name="Cash in Hand Validation").first()
    if not cash_ledger:
        cash_ledger = Ledger.objects.create(outlet_id=outlet.id, name="Cash in Hand Validation", group_id=cash_group or uuid.uuid4())
        
    party_ledger = Ledger.objects.filter(name="Test Party Validation").first()
    if not party_ledger:
        party_ledger = Ledger.objects.create(outlet_id=outlet.id, name="Test Party Validation", group_id=party_group or uuid.uuid4())
except Exception as e:
    print(f"Failed to setup ledgers: {e}")
    sys.exit(1)


print("\n--- Validation 3: Voucher Workflow (Destructive) ---")
voucher_payload = {
    'voucher_type': 'receipt',
    'date': datetime.now().strftime('%Y-%m-%d'),
    'narration': 'Test receipt voucher',
    'total_amount': 500.00,
    'lines': [
        {'ledger_id': str(cash_ledger.id), 'debit': 500.00, 'credit': 0},
        {'ledger_id': str(party_ledger.id), 'debit': 0, 'credit': 500.00},
    ]
}

# 1. Create Voucher
print("Creating Voucher...")
try:
    voucher = VoucherService.create_voucher(outlet_id=str(outlet.id), staff_id=str(staff.id), data=voucher_payload)
    print(f"Voucher created: {voucher.voucher_no} (Status: {voucher.status})")
except Exception as e:
    print(f"FAILED to create voucher: {e}")
    sys.exit(1)

# Verify balances
cash_ledger.refresh_from_db()
print(f"Cash ledger balance: {cash_ledger.current_balance}")

# 2. Try to update voucher without reason (should fail)
print("Attempting to edit posted voucher without reason...")
update_payload = voucher_payload.copy()
update_payload['lines'] = [
    {'ledger_id': str(cash_ledger.id), 'debit': 600.00, 'credit': 0},
    {'ledger_id': str(party_ledger.id), 'debit': 0, 'credit': 600.00},
]

try:
    atomic_voucher_update(
        voucher_id=str(voucher.id), 
        outlet_id=str(outlet.id), 
        payload=update_payload, 
        staff_id=str(staff.id)
    )
    print("FAILED: Allowed update without reason!")
except ValidationError as e:
    print(f"PASSED: Blocked update without reason: {e}")

# 3. Update voucher with reason (should succeed)
print("Attempting to edit posted voucher with reason...")
update_payload['revisionReasonCode'] = 'MODIFIED'
update_payload['revisionReasonText'] = 'Increased amount to 600 due to typo'

try:
    updated_voucher = atomic_voucher_update(
        voucher_id=str(voucher.id), 
        outlet_id=str(outlet.id), 
        payload=update_payload, 
        staff_id=str(staff.id)
    )
    print(f"PASSED: Voucher updated successfully.")
except Exception as e:
    print(f"FAILED: Could not update with reason: {e}")

# 4. Verify History is recorded
from apps.audit.models import DocumentRevision
from django.contrib.contenttypes.models import ContentType
ct = ContentType.objects.get_for_model(Voucher)
revisions = DocumentRevision.objects.filter(content_type=ct, object_id=str(voucher.id))
print(f"Revisions found for voucher: {revisions.count()}")
if revisions.count() > 0:
    print(f"Latest revision reason: {revisions.last().reason_text}")

# 5. Unbalanced voucher test
print("Attempting to create unbalanced voucher...")
unbalanced_payload = {
    'voucher_type': 'journal',
    'date': datetime.now().strftime('%Y-%m-%d'),
    'narration': 'Unbalanced',
    'lines': [
        {'ledger_id': str(cash_ledger.id), 'debit': 500.00, 'credit': 0},
        {'ledger_id': str(party_ledger.id), 'debit': 0, 'credit': 400.00},
    ]
}
try:
    VoucherService.create_voucher(outlet_id=str(outlet.id), staff_id=str(staff.id), data=unbalanced_payload)
    print("FAILED: Allowed unbalanced voucher!")
except ValidationError as e:
    print(f"PASSED: Blocked unbalanced voucher: {e}")

print("\n=== Validation Complete ===")
