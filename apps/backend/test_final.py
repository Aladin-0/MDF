import os
import sys
import requests
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
os.environ.setdefault('DATABASE_URL', 'postgres://mediflow:mediflow@localhost:5432/mediflow')
django.setup()

from apps.accounts.models import Staff
from rest_framework_simplejwt.tokens import RefreshToken

staff = Staff.objects.filter(role='super_admin').first()
if not staff: staff = Staff.objects.first()
refresh = RefreshToken.for_user(staff)
token = str(refresh.access_token)

headers = {'Authorization': f'Bearer {token}'}
outlet_id = 'c51446f2-cc72-42b5-b26f-fdb1c58e01d2'
purchase_id = '30f657cc-6c81-4d29-9591-cae74b12b746'

endpoints = [
    "/api/v1/auth/me/",
    f"/api/v1/purchases/?outletId={outlet_id}",
    f"/api/v1/purchases/{purchase_id}/?outletId={outlet_id}",
    f"/api/v1/inventory/?outletId={outlet_id}",
    f"/api/v1/products/search/?q=A&outletId={outlet_id}&context=purchase"
]

for path in endpoints:
    url = f"http://localhost:8000{path}"
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        print(f"OK {path}")
        print(f"   Shape snippet: {list(data.keys())[:5] if isinstance(data, dict) else (len(data), 'items')}")
    else:
        print(f"FAIL {path} -> {resp.status_code}")
        print(resp.text[:200])

