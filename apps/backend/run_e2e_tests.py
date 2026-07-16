import os, sys, django, uuid, json
from decimal import Decimal

sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from django.test import Client
from django.utils import timezone
from apps.core.models import Outlet, Organization
from apps.accounts.models import Customer, Staff, LedgerGroup, Ledger, Voucher, DebitNote, Doctor
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn
from django.conf import settings
from apps.audit.models import DocumentRevision, DocumentRevisionV2, ActivityEvent

def setup_data():
    outlet = Outlet.objects.first()
    staff = Staff.objects.first()
    return outlet, staff

def test_sale_invoice(outlet, staff):
    print("\n--- Test Sale Invoice ---")
    customer, _ = Customer.objects.get_or_create(name="E2E Cust", phone=f"{uuid.uuid4().int}"[:10], outlet=outlet)
    inv = SaleInvoice.objects.create(
        outlet=outlet, invoice_no=f"INV-{uuid.uuid4().hex[:6]}", invoice_date=timezone.now(),
        customer=customer, subtotal=100, taxable_amount=100, grand_total=100, payment_mode='cash',
        amount_paid=100, cash_paid=100, billed_by=staff,
        hospital_name="Old Hospital"
    )
    from apps.billing.sale_update_service import atomic_sale_update
    
    payload = {
        'revisionAction': 'header_correction',
        'revisionReasonCode': 'correction',
        'revisionReasonText': 'Updating hospital name for E2E testing',
        'grandTotal': '100.00',
        'subtotal': '100.00',
        'items': [],
        'hospital_name': 'New Hospital'
    }
    
    try:
        atomic_sale_update(sale_id=str(inv.id), payload=payload, outlet_id=str(outlet.id), updated_by_id=str(staff.id))
        print("Sale Invoice updated via service.")
    except Exception as e:
        print("Sale Invoice update failed:", e)
    return inv

def test_voucher(outlet, staff):
    print("\n--- Test Voucher ---")
    lg = LedgerGroup.objects.filter(name="Direct Expenses").first()
    if not lg:
        lg = LedgerGroup.objects.create(name="Direct Expenses", nature="expense")
    ledger, _ = Ledger.objects.get_or_create(name=f"Tea Exp {uuid.uuid4().hex[:6]}", group=lg, outlet=outlet)
    v = Voucher.objects.create(
        outlet=outlet, voucher_no=f"V-{uuid.uuid4().hex[:6]}", date=timezone.now().date(),
        voucher_type="payment", total_amount=50.0, narration="E2E test narration", created_by=staff
    )
    
    from apps.accounts.voucher_update_service import atomic_voucher_update
    payload = {
        "date": timezone.now().date().isoformat(),
        "voucher_type": "payment",
        "narration": "E2E update extended text here",
        "entries": [],
        "revisionReasonCode": "correction",
        "revisionReasonText": "E2E testing explanation string"
    }
    try:
        atomic_voucher_update(voucher_id=str(v.id), outlet_id=str(outlet.id), payload=payload, staff_id=str(staff.id))
        print("Voucher updated via service.")
    except Exception as e:
        print("Voucher update failed:", e)
    return v

def main():
    settings.AUDIT_V2_WRITE_ENABLED = True
    settings.AUDIT_V2_READ_ENABLED = True
    
    v2_initial = DocumentRevisionV2.objects.count()
    ae_initial = ActivityEvent.objects.count()

    outlet, staff = setup_data()
    
    inv = test_sale_invoice(outlet, staff)
    v = test_voucher(outlet, staff)
    
    # Check Revisions API
    client = Client()
    client.force_login(staff)
    resp = client.get(f'/api/v1/billing/sales/{inv.id}/revisions/?outletId={outlet.id}')
    print("Sale Invoice Revisions API Response:", resp.status_code)
    if resp.status_code == 200:
        data = resp.json()
        print("Sale Revisions returned:", len(data.get('revisions', [])))
        if len(data.get('revisions', [])) > 0:
            rev = data['revisions'][0]
            if 'old_snapshot' in rev and 'new_snapshot' in rev and 'diff_summary' in rev:
                print("JSON properly formed matching legacy structure.")
            else:
                print("JSON missing legacy fields! Data keys:", rev.keys())
    else:
        print(resp.json())
        
    resp2 = client.get(f'/api/v1/vouchers/{v.id}/history/?outletId={outlet.id}')
    print("Voucher History API Response:", resp2.status_code)
    if resp2.status_code == 200:
        data2 = resp2.json()
        print("Voucher Revisions returned:", len(data2.get('revisions', [])))
    
    v2_final = DocumentRevisionV2.objects.count()
    ae_final = ActivityEvent.objects.count()
    
    print("\n--- Verify DB Rows ---")
    print(f"DocumentRevisionV2 created: {v2_final - v2_initial}")
    print(f"ActivityEvent created: {ae_final - ae_initial}")

if __name__ == '__main__':
    main()
