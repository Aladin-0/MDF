import os
import django
from django.conf import settings

os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['DJANGO_SETTINGS_MODULE'] = 'mediflow.settings.prod'
django.setup()
print("DB settings:", settings.DATABASES)
