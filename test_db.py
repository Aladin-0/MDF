import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.prod")
django.setup()
from apps.inventory.models import MasterProduct, Batch
print("MasterProduct Count:", MasterProduct.objects.count())
print("Batch Count:", Batch.objects.count())
