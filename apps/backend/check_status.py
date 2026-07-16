import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from apps.accounts.models import Voucher
for v in Voucher.objects.all():
    print(v.voucher_no, v.status)
