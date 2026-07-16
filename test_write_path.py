import json
import django
import os
import sys

sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

# OVERRIDE FLAG FOR TEST
from django.conf import settings
settings.AUDIT_V2_WRITE_ENABLED = True

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.test import force_authenticate
from apps.billing.models import SaleInvoice
from apps.billing.views import SaleReviseView
from apps.audit.models import DocumentRevisionV2

factory = RequestFactory()
User = get_user_model()
user = User.objects.first()

invoice = SaleInvoice.objects.first()
payload = {
    'outletId': str(invoice.outlet_id),
    'billedBy': str(user.id),
    'revisionAction': 'commercial_correction',
    'revisionReasonCode': 'ENTRY_ERROR',
    'revisionReasonText': 'Proof test',
    'grandTotal': float(invoice.grand_total),
    'subtotal': float(invoice.subtotal),
    'discountAmount': float(invoice.discount_amount),
    'items': [],
    'cashPaid': float(invoice.grand_total),
    'paymentMode': 'cash'
}

request = factory.post(f'/api/v1/sales/{invoice.id}/revise/', data=payload, content_type='application/json')
force_authenticate(request, user=user)

# Monkeypatch user permissions for the test if it fails on 403
user.outlet = invoice.outlet
user.save()
request.META['HTTP_OUTLETID'] = str(invoice.outlet_id)

response = SaleReviseView.as_view()(request, sale_id=invoice.id)
print('Revise API Status:', response.status_code)

if response.status_code == 200:
    revisions = DocumentRevisionV2.objects.filter(object_id=invoice.id).order_by('-created_at')
    print('Revisions Found:', revisions.count())
    if revisions.exists():
        rev = revisions.first()
        print('Revision Action:', rev.action)
        print('Revision Old:', rev.old_snapshot_json.get('grand_total'))
        print('Revision New:', rev.new_snapshot_json.get('grand_total'))
        
        # Test serialization
        from apps.audit.serializers import DocumentRevisionV2LegacyAdapterSerializer
        data = DocumentRevisionV2LegacyAdapterSerializer(rev).data
        print('Serialized data keys:', list(data.keys()))
