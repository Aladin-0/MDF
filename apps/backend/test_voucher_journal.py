import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.accounts.models import Voucher, JournalEntry
from apps.accounts.voucher_update_service import atomic_voucher_update
from decimal import Decimal

# Let's see if we can run it. Wait, I can just check syntax for now.
