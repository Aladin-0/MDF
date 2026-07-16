import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.inventory.views import ProductSearchView
from django.test import RequestFactory
from rest_framework.test import force_authenticate
from apps.users.models import User
import json

user = User.objects.first()
factory = RequestFactory()
request = factory.get('/api/v1/inventory/products/search/?outletId=34c67f81-79e5-422f-a9cb-f4f0cbab7c2e&q=prac')
force_authenticate(request, user=user)

view = ProductSearchView.as_view()
response = view(request)
print(json.dumps(response.data, indent=2))
