import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
os.environ.setdefault('DATABASE_URL', 'postgres://mediflow:mediflow@localhost:5432/mediflow')
django.setup()

# override cache
settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}}

from rest_framework.test import APIClient
c = APIClient(SERVER_NAME='localhost')

from apps.accounts.models import Staff
user = Staff.objects.first()
if user:
    c.force_authenticate(user=user)

from apps.core.models import Outlet
outlet = Outlet.objects.first()

for path in ['/api/v1/auth/me/', '/api/v1/outletsettings/', f'/api/v1/purchases/?outletId={outlet.id}', f'/api/v1/inventory/?outletId={outlet.id}', f'/api/v1/products/search/?outletId={outlet.id}&q=A']:
    try:
        response = c.get(path)
        if response.status_code == 500:
            print(f"FAILED {path}")
            print(response.content.decode('utf-8')[:2000])
        else:
            print(f"OK {path} -> {response.status_code}")
    except Exception as e:
        import traceback
        print(f"CRASH {path}")
        traceback.print_exc()

