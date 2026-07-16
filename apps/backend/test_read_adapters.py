import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from django.test import RequestFactory
from rest_framework.test import force_authenticate
import uuid
import json

from apps.core.models import Organization, Outlet
from apps.accounts.models import Staff
from apps.audit.core import flags
from django.conf import settings

def test_read_adapters():
    settings.AUDIT_V2_WRITE_ENABLED = True
    settings.AUDIT_V2_READ_ENABLED = False
    
    org, _ = Organization.objects.get_or_create(name="Test Org")
    outlet, _ = Outlet.objects.get_or_create(organization=org, name="Test Outlet")
    staff = Staff.objects.filter(outlet=outlet, role='admin').first()
    if not staff:
        staff = Staff.objects.create(
            email=f"test_staff_{uuid.uuid4().hex[:6]}@mediflow.com",
            name='Test Staff', role='admin', staff_pin='1234', outlet=outlet
        )

    # Pick a random sale invoice and mutate it
    from apps.billing.models import SaleInvoice
    invoice = SaleInvoice.objects.filter(outlet=outlet).first()
    if not invoice:
        print("No invoice found, skipping read adapter test.")
        return

    # Trigger a mutation to generate a V2 revision
    from apps.billing.views import SaleReviseView
    factory = RequestFactory()
    
    payload = {
        "reviseReason": "E2E Testing V2 Read Adapter",
        "saleType": "credit",
        "items": [],
        "discountType": "percentage",
        "discountValue": 0,
        "amountPaid": 0
    }
    
    # Just a dummy put to SaleReviseView (or any other view that triggers Orchestrator)
    # Actually, let's just use the Orchestrator directly to ensure a V2 revision is written cleanly
    from apps.audit.core.orchestrator import record_mutation
    
    # Change something
    invoice.amount_due = float(invoice.amount_due) + 1.0
    
    def mutation():
        invoice.save()
        return invoice
        
    record_mutation(
        entity=invoice,
        actor=staff,
        action="update",
        mutation_fn=mutation,
        reason_code="E2E_TEST",
        reason_text="Testing read adapters"
    )
    
    print(f"Mutated invoice {invoice.id}, V2 revision should be generated.")

    # 1. Test V1 (Legacy)
    settings.AUDIT_V2_READ_ENABLED = False
    
    factory = RequestFactory()
    request = factory.get(f'/api/v1/billing/sales/{invoice.id}/revisions/?outletId={outlet.id}')
    force_authenticate(request, user=staff)

    from apps.billing.views import SaleRevisionDetailView
    view = SaleRevisionDetailView.as_view()
    
    response_v1 = view(request, sale_id=invoice.id)
    if response_v1.status_code != 200:
        print(f"V1 request failed: {response_v1.status_code}")
        return

    v1_data = response_v1.data
    
    # 2. Test V2 
    settings.AUDIT_V2_READ_ENABLED = True
    
    request = factory.get(f'/api/v1/billing/sales/{invoice.id}/revisions/?outletId={outlet.id}')
    force_authenticate(request, user=staff)
    
    response_v2 = view(request, sale_id=invoice.id)
    if response_v2.status_code != 200:
        print(f"V2 request failed: {response_v2.status_code}")
        return
        
    v2_data = response_v2.data

    v1_revs = v1_data.get('revisions', [])
    v2_revs = v2_data.get('revisions', [])
    
    print(f"V1 returned {len(v1_revs)} revisions")
    print(f"V2 returned {len(v2_revs)} revisions")
    
    if len(v1_revs) > 0 and len(v2_revs) > 0:
        # Compare the most recent revision
        v1_rev = v1_revs[0]
        v2_rev = v2_revs[0]
        
        mismatches = []
        for key in v1_rev:
            if key not in v2_rev:
                mismatches.append(f"Missing key in V2: {key}")
            else:
                if v1_rev[key] != v2_rev[key]:
                    # Ignore created_at exact string match due to microsecond differences
                    if key not in ('created_at', 'updated_at', 'modified_at'):
                        mismatches.append(f"Mismatch in {key}: V1={v1_rev[key]} V2={v2_rev[key]}")
                        
        if mismatches:
            print("FAIL: V2 Adapter does not match V1:")
            for m in mismatches:
                print(m)
        else:
            print("PASS: V2 Adapter perfectly matches V1 structure!")
    else:
        print("FAIL: Missing revisions.")

if __name__ == '__main__':
    test_read_adapters()
