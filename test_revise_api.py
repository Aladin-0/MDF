import json
import django
import os
import sys

sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.test import force_authenticate
from apps.billing.models import SaleInvoice
from apps.billing.views import SaleReviseView

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
response = SaleReviseView.as_view()(request, sale_id=invoice.id)
print('Revise API Status:', response.status_code)
if response.status_code == 200:
    print('Keys:', list(response.data.keys()))
    print('createdAt:', response.data.get('createdAt'))
    print('message:', response.data.get('message'))
else:
    print('Error:', response.data)
