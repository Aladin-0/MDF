import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from apps.billing.models import SaleInvoice

User = get_user_model()
user = User.objects.filter(role="super_admin").first()

sale = SaleInvoice.objects.last()
item = sale.items.first()

payload = {
    "outletId": str(sale.outlet_id),
    "originalSaleId": str(sale.id),
    "returnDate": "2026-07-07T00:00:00Z",
    "refundMode": "cash",
    "reason": "Test Create Return",
    "items": [
        {
            "saleItemId": str(item.id),
            "batchId": str(item.batch_id),
            "qtyReturned": 1,
            "returnRate": float(item.rate),
        }
    ]
}

from rest_framework.test import APIClient
client = APIClient()
client.force_authenticate(user=user)

response = client.post(
    '/api/v1/sales/return/',
    data=json.dumps(payload),
    content_type='application/json',
    HTTP_OUTLETID=str(sale.outlet_id),
    SERVER_NAME='localhost'
)

print(response.status_code)
print(response.content.decode('utf-8'))
