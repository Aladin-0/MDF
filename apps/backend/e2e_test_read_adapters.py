import os
import sys
import django

sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff
from django.conf import settings
from django.test import RequestFactory
from rest_framework.test import force_authenticate
from apps.audit.core.context import set_audit_context, AuditContext
from apps.audit.core.orchestrator import record_mutation
import uuid

def e2e_test_read_adapters():
    settings.AUDIT_V2_WRITE_ENABLED = True
    
    org, _ = Organization.objects.get_or_create(name="Test Org")
    outlet, _ = Outlet.objects.get_or_create(name="Test Outlet", organization=org)
    staff = Staff.objects.filter(outlet=outlet, role='admin').first()
    if not staff:
        staff, _ = Staff.objects.get_or_create(email=f"test_staff_{uuid.uuid4().hex[:6]}@mediflow.com", defaults={"name": "Test Admin", "role": "admin", "outlet": outlet, "staff_pin": "1234", "phone": f"{uuid.uuid4().hex[:10]}"})

    # Setup Context so tenant_id is not None!
    set_audit_context(AuditContext(
        request_id="e2e-test-123",
        user_id=str(staff.id),
        actor_type="human",
        tenant_id=str(outlet.id),
        ip_address="127.0.0.1",
        user_agent="e2e-script"
    ))

    # Pick an invoice
    from apps.billing.models import SaleInvoice
    invoice = SaleInvoice.objects.filter(outlet=outlet).first()
    if not invoice:
        # Create one if none exists
        from apps.accounts.models import Customer
        customer, _ = Customer.objects.get_or_create(name="Test Customer", phone="8888888888", outlet=outlet)
        from decimal import Decimal
        invoice = SaleInvoice.objects.create(
            outlet=outlet,
            invoice_no=f"INV-{uuid.uuid4().hex[:6]}",
            customer=customer,
            subtotal=Decimal('100.00'),
            taxable_amount=Decimal('100.00'),
            grand_total=Decimal('100.00'),
            payment_mode='cash',
            amount_paid=Decimal('100.00'),
            billed_by=staff
        )

    # Mutate to create V2 revision
    invoice.amount_due = float(invoice.amount_due) + 1.0
    def mutation():
        invoice.save()
        return invoice
        
    record_mutation(
        entity=invoice,
        action="update",
        module="billing",
        old_snapshot={"amount_due": invoice.amount_due - 1},
        new_snapshot={"amount_due": invoice.amount_due},
        reason_code="E2E_TEST",
        reason_text="Testing read adapters"
    )

    # 1. Test V1 (Legacy)
    settings.AUDIT_V2_READ_ENABLED = False
    factory = RequestFactory()
    request = factory.get(f'/api/v1/billing/sales/{invoice.id}/revisions/?outletId={outlet.id}')
    force_authenticate(request, user=staff)

    from apps.billing.views import SaleRevisionDetailView
    view = SaleRevisionDetailView.as_view()
    
    response_v1 = view(request, sale_id=invoice.id)
    v1_data = response_v1.data
    
    # 2. Test V2 
    settings.AUDIT_V2_READ_ENABLED = True
    request = factory.get(f'/api/v1/billing/sales/{invoice.id}/revisions/?outletId={outlet.id}')
    force_authenticate(request, user=staff)
    
    response_v2 = view(request, sale_id=invoice.id)
    v2_data = response_v2.data

    v1_revs = v1_data.get('revisions', [])
    v2_revs = v2_data.get('revisions', [])
    
    print(f"V1 returned {len(v1_revs)} revisions")
    print(f"V2 returned {len(v2_revs)} revisions")
    
    if len(v1_revs) > 0 and len(v2_revs) > 0:
        v1_rev = v1_revs[0]
        v2_rev = v2_revs[0]
        
        mismatches = []
        for key in v1_rev:
            if key not in v2_rev:
                mismatches.append(f"Missing key in V2: {key}")
            else:
                if v1_rev[key] != v2_rev[key]:
                    if key not in ('created_at', 'updated_at', 'modified_at'):
                        mismatches.append(f"Mismatch in {key}: V1={v1_rev[key]} V2={v2_rev[key]}")
                        
        if mismatches:
            print("FAIL: V2 Adapter does not match V1:")
            for m in mismatches:
                print(m)
        else:
            print("PASS: V2 Adapter perfectly matches V1 structure! E2E 8 & 9 are validated.")
            
    else:
        print("FAIL: Missing revisions.")

if __name__ == '__main__':
    e2e_test_read_adapters()
