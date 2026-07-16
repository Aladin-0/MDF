import os
import sys
import django
from django.test import Client

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
os.environ['SECRET_KEY'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'

django.setup()

from django.conf import settings
settings.ALLOWED_HOSTS = ['*']

from django.core.management import call_command
call_command('migrate', verbosity=0)

from apps.accounts.models import User, Staff
user = User.objects.create(email="test@test.com", is_staff=True)
staff = Staff.objects.create(user=user, name="test")

from apps.core.models import Outlet, Chain
chain = Chain.objects.create(name="test")
outlet = Outlet.objects.create(name="test", chain=chain)

from apps.billing.models import SaleInvoice
invoice = SaleInvoice.objects.create(outlet=outlet, invoice_no="INV-01", total_amount=100)

client = Client(HTTP_HOST='localhost')
client.force_login(user)

print("GET /api/v1/revisions/")
try:
    response = client.get(f'/api/v1/revisions/?outletId={outlet.id}')
    print(f"Status: {response.status_code}")
    print(response.content)
except Exception as e:
    import traceback
    traceback.print_exc()

print("\nGET /api/v1/sales/<uuid>/revisions/")
try:
    response = client.get(f'/api/v1/sales/{invoice.id}/revisions/?outletId={outlet.id}')
    print(f"Status: {response.status_code}")
    print(response.content)
except Exception as e:
    import traceback
    traceback.print_exc()
