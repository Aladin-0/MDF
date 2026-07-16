import json
import uuid
import datetime
import traceback
from decimal import Decimal
import django
import os
import sys

# Add the project root to sys.path so we can import apps
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from django.test import RequestFactory, Client
from django.contrib.auth import get_user_model
from rest_framework.test import force_authenticate
from apps.billing.models import SaleInvoice
from apps.accounts.models import Customer, Ledger, Doctor
from apps.audit.models import DocumentRevisionV2
from apps.billing.views import SaleDetailView, SaleCreateView, SaleReviseView
from apps.audit.views import UnifiedRevisionDetailView

def verify():
    factory = RequestFactory()
    User = get_user_model()
    user = User.objects.first()
    
    # 2. Modify Invoice API Response
    invoice = SaleInvoice.objects.filter(doctor__isnull=False).first()
    if not invoice:
        invoice = SaleInvoice.objects.first()
        if invoice:
            doctor = Doctor.objects.create(name="Dr. Proof", outlet=invoice.outlet)
            invoice.doctor = doctor
            invoice.hospital_name = "Proof Hospital"
            invoice.save()

    print("=== PROOF 2: SaleDetailView Response ===")
    if invoice:
        request = factory.get(f'/api/v1/sales/{invoice.id}/?outletId={invoice.outlet_id}')
        force_authenticate(request, user=user)
        response = SaleDetailView.as_view()(request, pk=invoice.id)
        data = response.data
        print(f"Doctor data: {json.dumps(data.get('doctor'))}")
        print(f"Hospital Name: {data.get('hospitalName')}")
    
    # 4. DB Verification & 1. Request Payload
    print("\n=== PROOF 1 & 4: Invoice Update & Revision ===")
    payload = {
        "outletId": str(invoice.outlet_id),
        "billedBy": str(user.id),
        "revisionAction": "commercial_correction",
        "revisionReasonCode": "ENTRY_ERROR",
        "revisionReasonText": "Proof test",
        "grandTotal": float(invoice.grand_total),
        "subtotal": float(invoice.subtotal),
        "discountAmount": float(invoice.discount_amount),
        "items": []
    }
    
    request = factory.post(f'/api/v1/sales/{invoice.id}/revise/', data=payload, content_type='application/json')
    force_authenticate(request, user=user)
    response = SaleReviseView.as_view()(request, sale_id=invoice.id)
    print(f"Revise API Status: {response.status_code}")
    
    invoice.refresh_from_db()
    print(f"Invoice DB Status: OK (Grand Total: {invoice.grand_total})")
    
    revisions = DocumentRevisionV2.objects.filter(object_id=invoice.id).order_by('-created_at')
    print(f"Revisions Found: {revisions.count()}")
    if revisions.exists():
        rev = revisions.first()
        print(f"Latest Revision: Action={rev.action}, Reason={rev.reason_code}")
        
    # 3. Revision History API Response
    print("\n=== PROOF 3: Revision History API ===")
    request = factory.get(f'/api/v1/audit/revisions/sale/{invoice.id}/?outletId={invoice.outlet_id}')
    force_authenticate(request, user=user)
    response = UnifiedRevisionDetailView.as_view()(request, record_type='sale', record_id=invoice.id)
    if response.status_code == 200:
        rev_data = response.data.get('revisions', [])
        if rev_data:
            first_rev = rev_data[0]
            print(f"Created At in response: {first_rev.get('created_at')}")
            print(f"Modified At in response: {first_rev.get('modified_at')}")
            print(f"Resulting Document ID: {first_rev.get('resulting_document_id')}")
        else:
            print("No revisions in API response data.")
    else:
        print(f"API Error: {response.status_code}")

if __name__ == '__main__':
    verify()
