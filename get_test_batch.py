import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.inventory.models import Batch
batch = Batch.objects.filter(outlet_id='d5349da2-dc06-405e-a5ee-6370c5e75c91', current_stock__gt=0).first()
if batch:
    print(f"BATCH_ID={batch.id}")
    print(f"PRODUCT_ID={batch.product_id}")
else:
    print("No valid batch found")
