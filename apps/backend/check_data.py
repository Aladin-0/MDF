import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.reports.models import GSTTransactionSnapshot
from apps.core.models import Outlet

outlets = Outlet.objects.all()
if outlets.exists():
    print("Outlets:", list(outlets.values('id', 'gstin', 'state_code')))

snaps = GSTTransactionSnapshot.objects.filter(period="092026")
print(f"Snapshots for 092026: {snaps.count()}")
for s in snaps:
    print(s.transaction_type, s.snapshot_json)

