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

client = Client(HTTP_HOST='localhost')
client.force_login(user)

print("GET /api/v1/revisions/")
try:
    response = client.get('/api/v1/revisions/?outletId=1')
    print(f"Status: {response.status_code}")
    print(response.content)
except Exception as e:
    import traceback
    traceback.print_exc()

print("\nGET /api/v1/sales/123e4567-e89b-12d3-a456-426614174000/revisions/?outletId=1")
try:
    response = client.get('/api/v1/sales/123e4567-e89b-12d3-a456-426614174000/revisions/?outletId=1')
    print(f"Status: {response.status_code}")
    print(response.content)
except Exception as e:
    import traceback
    traceback.print_exc()
