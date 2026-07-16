import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()
from apps.inventory.models import Batch, MasterProduct
product = MasterProduct.objects.filter(name__icontains='0001Pracitemol').first()
if product:
    print("Product found:", product.name)
    Batch.objects.filter(product=product).update(purchase_rate=5.00, sale_rate=10.00, mrp=12.00)
    print("Updated batches!")
