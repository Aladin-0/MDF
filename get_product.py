import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.inventory.models import Product

for p in Product.objects.filter(name__icontains="seed"):
    print(p.name, p.id)
