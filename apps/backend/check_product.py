import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.dev')
django.setup()
from apps.inventory.models import MasterProduct, Batch
qs = MasterProduct.objects.filter(name__icontains="FIBER COMMOD")
print(f"Count: {qs.count()}")
for p in qs:
    print(p.id, p.name, p.is_discontinued)
