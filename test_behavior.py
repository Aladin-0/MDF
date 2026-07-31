import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.test_settings')
django.setup()

from apps.inventory.models import MasterProduct
from decimal import Decimal

p = MasterProduct(
    name="Test Medicine",
    mrp=Decimal('100.00'),
    pack_size=10, pack_type="strip", pack_unit="tablet"
)
print("pack_size:", p.pack_size)
print("pack_type:", p.pack_type)
print("pack_unit:", p.pack_unit)
print("behavior_class:", p.behavior_class)

