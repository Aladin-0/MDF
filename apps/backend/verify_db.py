import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.dev")
django.setup()

from django.test import Client
from apps.purchases.models import Purchase
from apps.audit.models import DocumentRevisionV2
from apps.inventory.models import Batch
from apps.financials.models import LedgerEntry
import json

print("Django setup successful.")
