import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
os.environ.setdefault('DATABASE_URL', 'postgres://mediflow:mediflow@localhost:5432/mediflow')
django.setup()

from rest_framework.test import APIClient
from apps.accounts.models import Staff
from apps.purchases.models import PurchaseInvoice

staff = Staff.objects.filter(role='super_admin').first()
if not staff:
    staff = Staff.objects.first()

c = APIClient(SERVER_NAME='localhost')
c.force_authenticate(user=staff)

invoice = PurchaseInvoice.objects.first()
if not invoice:
    print("No invoices")
    sys.exit(0)

url = f"/api/v1/purchases/{invoice.id}/?outletId={invoice.outlet_id}"
resp = c.get(url)
print("Status:", resp.status_code)
data = resp.json()

if 'items' in data:
    print(f"Items length: {len(data['items'])}")
    if len(data['items']) > 0:
        print("First item:", data['items'][0])
else:
    print("NO ITEMS FIELD!", data.keys())
