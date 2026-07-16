import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client
from apps.accounts.models import User
import json

client = Client()
user = User.objects.filter(is_superuser=True).first()
if not user:
    user = User.objects.first()

client.force_login(user)

payload = {
  "outletId": "d5349da2-dc06-405e-a5ee-6370c5e75c91",
  "paymentMode": "cash",
  "cashPaid": 10,
  "subtotal": 10,
  "discountAmount": 0,
  "taxableAmount": 10,
  "cgstAmount": 0,
  "sgstAmount": 0,
  "igstAmount": 0,
  "cgst": 0,
  "sgst": 0,
  "igst": 0,
  "roundOff": 0,
  "grandTotal": 10,
  "items": [
    {
      "batchId": "9b801458-865f-4e8e-af75-f81946b8c4e6",
      "productId": "bf88b0aa-e793-4674-a09d-941a1a956deb",
      "qtyStrips": 1,
      "qtyLoose": 0,
      "rate": 10,
      "discountPct": 0,
      "gstRate": 0,
      "taxableAmount": 10,
      "gstAmount": 0,
      "totalAmount": 10
    }
  ]
}

response = client.post('/api/v1/sales/', data=json.dumps(payload), content_type='application/json')
print("Status Code:", response.status_code)
print("Response Content:", response.content)
