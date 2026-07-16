import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from django.test import RequestFactory
from rest_framework.test import force_authenticate
import uuid
import json

from apps.core.models import Organization
from apps.accounts.models import Staff, Voucher, Ledger
from apps.audit.core import flags
from django.conf import settings
import verify_parity

def simulate():
    settings.AUDIT_V2_WRITE_ENABLED = True
    settings.AUDIT_V2_READ_ENABLED = False
    
    from apps.core.models import Outlet
    org, _ = Organization.objects.get_or_create(name="Test Org")
    outlet, _ = Outlet.objects.get_or_create(organization=org, name="Test Outlet")
    staff, _ = Staff.objects.get_or_create(
        email="test_staff_voucher@mediflow.com",
        defaults={'name': 'Test Staff V', 'role': 'admin', 'staff_pin': '1234', 'outlet': outlet}
    )
    
    ledger1, _ = Ledger.objects.get_or_create(outlet=outlet, name="Cash")
    ledger2, _ = Ledger.objects.get_or_create(outlet=outlet, name="Sales")
    
    # 1. Create a Voucher directly
    voucher = Voucher.objects.create(
        outlet=outlet,
        voucher_no=f"V-{uuid.uuid4().hex[:6]}",
        date="2026-07-12",
        voucher_type="receipt",
        total_amount=100.0,
        narration="Test Voucher",
        created_by=staff
    )
    
    # 2. Update via view to trigger dual-write
    from apps.accounts.voucher_views import VoucherDetailView
    view = VoucherDetailView.as_view()
    factory = RequestFactory()
    
    payload = {
        "date": "2026-07-13",
        "voucher_type": "receipt",
        "narration": "Updated Voucher",
        "entries": [],
        "revisionReasonCode": "correction",
        "revisionReasonText": "Testing dual write"
    }
    
    request = factory.put(f'/api/v1/accounts/vouchers/{voucher.id}/', payload, content_type='application/json')
    force_authenticate(request, user=staff)
    request.user = staff
    request._full_data = payload
    
    print("Sending Voucher update request...")
    response = view(request, voucher_id=voucher.id)
    print(f"Voucher Update response status: {response.status_code}")
    
    verify_parity.run_parity_check()

if __name__ == '__main__':
    simulate()
