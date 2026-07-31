import os
import django
os.environ['CACHES'] = 'dummy'

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
os.environ.setdefault('DATABASE_URL', 'postgres://mediflow:mediflow@localhost:5432/mediflow')
django.setup()

from rest_framework.test import APIClient
c = APIClient(SERVER_NAME='localhost')

from apps.accounts.models import Staff
user = Staff.objects.first()
if user:
    c.force_authenticate(user=user)
else:
    print("No user found")

# Also need an outlet in query params for inventory
from apps.core.models import Outlet
outlet = Outlet.objects.first()

response = c.get(f'/api/v1/inventory/?outletId={outlet.id}')
print(f"Inventory Status: {response.status_code}")
if response.status_code == 500:
    print(response.content.decode('utf-8')[:2000])

response = c.get('/api/v1/purchases/')
print(f"Purchases Status: {response.status_code}")
if response.status_code == 500:
    print(response.content.decode('utf-8')[:2000])

response = c.get('/api/v1/auth/me/')
print(f"Auth Status: {response.status_code}")
if response.status_code == 500:
    print(response.content.decode('utf-8')[:2000])
