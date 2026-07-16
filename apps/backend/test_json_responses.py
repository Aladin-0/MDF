import os
import django
from django.test import Client

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
os.environ['SECRET_KEY'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
django.setup()
from django.conf import settings
settings.ALLOWED_HOSTS = ['*']

client = Client(HTTP_HOST='localhost')
response = client.get('/api/v1/sales/not-a-uuid/revisions/')
print(f"Status: {response.status_code}")
print(response.content)
