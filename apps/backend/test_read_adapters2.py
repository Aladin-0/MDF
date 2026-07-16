import os
import sys
import django
import json

sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff
from django.conf import settings
from django.test import RequestFactory
from rest_framework.test import force_authenticate

def test_read_adapters_with_existing_mutations():
    settings.AUDIT_V2_WRITE_ENABLED = True
    
    org = Organization.objects.first()
    outlet = Outlet.objects.first()
    staff = Staff.objects.filter(role="admin").first()

    # Find the invoice we just mutated in simulate_mutations.py (or any invoice that has V2 revisions)
    from apps.audit.models import DocumentRevisionV2
    from apps.billing.models import SaleInvoice
    from django.contrib.contenttypes.models import ContentType
    
    ct = ContentType.objects.get_for_model(SaleInvoice)
    v2_rev = DocumentRevisionV2.objects.filter(content_type=ct).first()
    if not v2_rev:
        print("No V2 revisions found. Make sure simulate_mutations.py ran recently.")
        return
        
    invoice_id = v2_rev.object_id
    
    # 1. Test V1 (Legacy)
    settings.AUDIT_V2_READ_ENABLED = False
    
    factory = RequestFactory()
    request = factory.get(f'/api/v1/billing/sales/{invoice_id}/revisions/?outletId={outlet.id}')
    force_authenticate(request, user=staff)
    request.user = staff

    from apps.billing.views import SaleRevisionDetailView
    view = SaleRevisionDetailView.as_view()
    
    response_v1 = view(request, sale_id=invoice_id)
    if response_v1.status_code != 200:
        print(f"V1 request failed: {response_v1.status_code}")
        return

    v1_data = response_v1.data
    
    # 2. Test V2 
    settings.AUDIT_V2_READ_ENABLED = True
    
    request = factory.get(f'/api/v1/billing/sales/{invoice_id}/revisions/?outletId={outlet.id}')
    force_authenticate(request, user=staff)
    request.user = staff
    
    response_v2 = view(request, sale_id=invoice_id)
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
                    if key not in ('created_at', 'updated_at', 'modified_at'):
                        mismatches.append(f"Mismatch in {key}: V1={v1_rev[key]} V2={v2_rev[key]}")
                        
        if mismatches:
            print("FAIL: V2 Adapter does not match V1:")
            for m in mismatches:
                print(m)
        else:
            print("PASS: V2 Adapter perfectly matches V1 structure! Read-path fallback is safe.")
            
    else:
        print("FAIL: Missing revisions.")

if __name__ == '__main__':
    test_read_adapters_with_existing_mutations()
