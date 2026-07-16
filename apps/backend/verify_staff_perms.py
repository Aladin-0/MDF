import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.test import force_authenticate
from apps.accounts.views import StaffDetailView
from apps.accounts.models import Staff

factory = RequestFactory()
User = get_user_model()
staff = Staff.objects.filter(role='super_admin').first()

if not staff:
    print("No super_admin found.")
    exit(1)

# Ensure the super_admin has an outlet
if not staff.outlet:
    print("Super admin has no outlet.")
    exit(1)

target_staff = Staff.objects.filter(outlet=staff.outlet).exclude(id=staff.id).first()
if not target_staff:
    target_staff = staff  # Just test on self if no other staff

data = {
    'canModifyPaidPurchases': True,
    'canViewAuditHistory': True,
}

req = factory.patch(f'/api/v1/staff/{target_staff.id}/', data, content_type='application/json')
force_authenticate(req, user=staff)

res = StaffDetailView.as_view()(req, pk=target_staff.id)
print('Response Status:', res.status_code)
if res.status_code == 200:
    target_staff.refresh_from_db()
    print('can_modify_paid_purchases:', target_staff.can_modify_paid_purchases)
    print('can_view_audit_history:', target_staff.can_view_audit_history)
