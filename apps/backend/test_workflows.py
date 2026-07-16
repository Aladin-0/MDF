import os
import sys
import django
from decimal import Decimal

sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from django.test import Client
from apps.accounts.models import Staff, Customer, Doctor, Voucher
from apps.core.models import Outlet
from apps.billing.models import SaleInvoice
from apps.purchases.models import PurchaseInvoice, Distributor
from apps.inventory.models import Batch, MasterProduct
from apps.audit.models import DocumentRevision, DocumentRevisionV2, ActivityEvent
from apps.audit.core import flags
from django.conf import settings
from django.utils import timezone
import uuid

def setup_data():
    outlet = Outlet.objects.first()
    if not outlet:
        outlet = Outlet.objects.create(name="Test Outlet", id=uuid.uuid4())

    staff = Staff.objects.first()
    if not staff:
        staff = Staff.objects.create(name="Test Staff", phone="9999999999", is_superuser=True)
        staff.outlets.add(outlet)
    
    return outlet, staff

def run():
    print("Testing with AUDIT_V2_WRITE_ENABLED =", getattr(settings, 'AUDIT_V2_WRITE_ENABLED', False))
    print("Testing with AUDIT_V2_READ_ENABLED =", getattr(settings, 'AUDIT_V2_READ_ENABLED', False))
    
    outlet, staff = setup_data()
    client = Client()
    client.force_login(staff)
    
    # 1. Sale Invoice
    print("\n--- Testing Sale Invoice ---")
    customer, _ = Customer.objects.get_or_create(phone="9876543210", defaults={"name": "Test Cust", "outlet": outlet})
    
    inv = SaleInvoice.objects.create(
        outlet=outlet,
        customer=customer,
        invoice_no=f"INV-{uuid.uuid4().hex[:6]}",
        invoice_date=timezone.now().date(),
        subtotal=100, discount_amount=0, taxable_amount=100,
        cgst_amount=0, sgst_amount=0, igst_amount=0,
        cgst=0, sgst=0, igst=0, round_off=0, grand_total=100,
        payment_mode='cash', cash_paid=100, upi_paid=0, card_paid=0,
        credit_given=0, amount_paid=100, amount_due=0, is_return=False,
        billed_by=staff, extra_discount_pct=0, is_cancelled=False
    )
    
    # Modify it via service
    from apps.billing.revision_service import revise_bill
    try:
        new_inv, revision = revise_bill(
            invoice_id=inv.id,
            modified_by_id=staff.id,
            reason_code="correction",
            reason_text="Test change",
            changes={'grand_total': 90, 'amount_paid': 90, 'cash_paid': 90, 'subtotal': 90, 'taxable_amount': 90}
        )
        print("Sale Invoice modified successfully.")
    except Exception as e:
        print("Error modifying Sale Invoice:", e)
        import traceback; traceback.print_exc()

    # 2. Check DB rows
    v1_count = DocumentRevision.objects.filter(object_id=inv.id).count()
    v2_count = DocumentRevisionV2.objects.filter(object_id=inv.id).count()
    print(f"SaleInvoice {inv.id} - DocumentRevision count: {v1_count}, DocumentRevisionV2 count: {v2_count}")

    # Check API
    resp = client.get(f'/api/v1/billing/sales/{inv.id}/revisions/?outletId={outlet.id}')
    print(f"API /api/v1/billing/sales/<id>/revisions/ Response Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"API Returned {len(data.get('revisions', []))} revisions.")

if __name__ == "__main__":
    run()
