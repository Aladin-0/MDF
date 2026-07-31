import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.test_settings')
django.setup()

from apps.inventory.models import MasterProduct
print([f.name for f in MasterProduct._meta.fields])
