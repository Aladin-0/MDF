import requests
import sys
import json

# get jwt from db
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
django.setup()

from apps.core.models import User
from rest_framework_simplejwt.tokens import AccessToken
from apps.inventory.models import MasterProduct

user = User.objects.filter(is_superuser=True).first()
token = str(AccessToken.for_user(user))
product = MasterProduct.objects.filter(name__icontains='citri').first()

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
}

payload = {
    'name': product.name,
    'composition': product.composition,
    'manufacturer': product.manufacturer,
    'hsnCode': product.hsn_code,
    'gstRate': 12,
    'packSize': 14,
    'packUnit': 'tablet',
    'packType': 'strip',
    'scheduleType': 'OTC',
    'mrp': 20,
    'saleRate': 10,
    'minQty': 10,
    'reorderQty': 50,
    'isFridge': False,
    'isDiscontinued': False
}

print(f"Sending PUT to http://localhost:8000/api/v1/products/{product.id}/")
resp = requests.put(f'http://localhost:8000/api/v1/products/{product.id}/', json=payload, headers=headers)
print('Status:', resp.status_code)
try:
    print('Response:', resp.json())
except:
    print('Raw text:', resp.text[:200])

