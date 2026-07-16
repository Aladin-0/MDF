import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()
from apps.inventory.models import Batch
batches = Batch.objects.filter(batch_no='HAV16')
batches.update(qty_strips=1000, qty_loose=0)
print("Updated stock for HAV16 to 1000 strips")
