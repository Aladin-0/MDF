import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Voucher, Staff
from rest_framework.test import APIClient
import json

v = Voucher.objects.first()
staff = Staff.objects.filter(role='admin').first()

client = APIClient(SERVER_NAME='localhost')
client.force_authenticate(user=staff)
response = client.get(f"/api/accounts/vouchers/{v.id}/history/?outletId={v.outlet_id}")

print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    revisions = data.get('revisions', [])
    print(f"Number of revisions returned: {len(revisions)}")
    if revisions:
        print(f"Latest Revision action: {revisions[0].get('action')}")
else:
    print(response.content.decode())
