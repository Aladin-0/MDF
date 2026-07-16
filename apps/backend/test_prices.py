import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()
from apps.inventory.models import Batch, MasterProduct
product = MasterProduct.objects.filter(name__icontains='0001Pracitemol').first()
if product:
    print("Product found:", product.name)
    batches = Batch.objects.filter(product=product)
    for b in batches:
        print(f"Batch {b.batch_no}: PR={b.purchase_rate}, SR={b.sale_rate}, MRP={b.mrp}")
else:
    print("Product not found")
