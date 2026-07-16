import os
import sys
import django
import json
from decimal import Decimal

# Set up Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.core.models import Outlet, Organization
from apps.accounts.models import Customer, Staff, LedgerGroup, Ledger
from apps.billing.models import SaleInvoice, SaleItem
from apps.billing.views import SaleCreateView
from apps.billing.sale_update_service import atomic_sale_update
from apps.inventory.models import MasterProduct, Batch
from apps.audit.core import flags
from django.utils import timezone

def simulate():
    # 1. Enable V2 writes
    from django.conf import settings
    settings.AUDIT_V2_WRITE_ENABLED = True
    settings.AUDIT_V2_READ_ENABLED = False

    # 2. Get or create test data
    org, _ = Organization.objects.get_or_create(name="Test Org")
    outlet, _ = Outlet.objects.get_or_create(name="Test Outlet", organization=org)
    staff, _ = Staff.objects.get_or_create(name="Test Admin", role="admin", outlet=outlet, phone="9999999999")
    customer, _ = Customer.objects.get_or_create(name="Test Customer", phone="8888888888", outlet=outlet)
    
    # Needs ledgers
    lg = LedgerGroup.objects.filter(name="Sundry Debtors").first()
    if not lg:
        lg = LedgerGroup.objects.create(name="Sundry Debtors", nature="asset")
    Ledger.objects.get_or_create(name=customer.name, group=lg, outlet=outlet)
    
    # 3. Create a Sale Invoice
    invoice_no = f"INV-TEST-{timezone.now().strftime('%Y%M%d%H%M%S')}"
    
    # Let's bypass views and use serializers/services if possible, or just create it directly
    # Wait, the views have the dual write for CREATE. Let's create it manually to test the update.
    # We want to test UPDATE dual write parity.
    invoice = SaleInvoice.objects.create(
        outlet=outlet,
        invoice_no=invoice_no,
        invoice_date=timezone.now(),
        customer=customer,
        subtotal=Decimal('100.00'),
        taxable_amount=Decimal('100.00'),
        grand_total=Decimal('100.00'),
        payment_mode='cash',
        amount_paid=Decimal('100.00'),
        cash_paid=Decimal('100.00'),
        billed_by=staff
    )
    
    prod, _ = MasterProduct.objects.get_or_create(name="Paracetamol", pack_size=10, pack_unit='tablet', pack_type='strip')
    batch, _ = Batch.objects.get_or_create(
        outlet=outlet, product=prod, batch_no="B1", expiry_date="2027-12-01", 
        mrp=Decimal('10.00'), sale_rate=Decimal('10.00'), purchase_rate=Decimal('10.00'), qty_strips=100
    )
    
    SaleItem.objects.create(
        invoice=invoice,
        batch=batch,
        product_name="Paracetamol",
        pack_size=10,
        pack_unit='tablet',
        batch_no="B1",
        expiry_date="2027-12-01",
        mrp=Decimal('10.00'),
        sale_rate=Decimal('10.00'),
        qty_strips=10,
        qty_loose=0,
        rate=Decimal('10.00'),
        gst_rate=Decimal('0'),
        taxable_amount=Decimal('100.00'),
        gst_amount=Decimal('0'),
        total_amount=Decimal('100.00')
    )
    
    # 4. Perform an update using the same logic as the View
    from apps.billing.views import SaleReviseView
    from django.test import RequestFactory
    
    factory = RequestFactory()
    payload = {
        'revisionAction': 'header_correction',
        'revisionReasonCode': 'correction',
        'revisionReasonText': 'Patient requested name change',
        'grandTotal': '100.00',
        'subtotal': '100.00',
        'items': [] # we leave items empty for header correction or supply them
    }
    
    from rest_framework.test import force_authenticate
    view = SaleReviseView.as_view()
    request = factory.post(f'/api/v1/billing/sales/{invoice.id}/revise/', payload, content_type='application/json')
    force_authenticate(request, user=staff)
    request.user = staff
    request._full_data = payload
    
    response = view(request, sale_id=invoice.id)
    
    print(f"Update response status: {response.status_code}")
    print(f"Update response data: {response.data}")
    
    # 5. Run Parity check
    import verify_parity
    verify_parity.run_parity_check()

if __name__ == '__main__':
    simulate()
