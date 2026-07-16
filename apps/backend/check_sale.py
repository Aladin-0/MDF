import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from apps.billing.models import SaleInvoice
from rest_framework.test import APIRequestFactory
from apps.billing.views import SaleDetailView

sale = SaleInvoice.objects.exclude(doctor__isnull=True).last()
if not sale:
    sale = SaleInvoice.objects.last()

if sale:
    print(f"Sale ID: {sale.id}")
    factory = APIRequestFactory()
    request = factory.get(f'/api/v1/sales/{sale.id}/')
    view = SaleDetailView.as_view()
    response = view(request, sale_id=str(sale.id))
    print(json.dumps(response.data, indent=2))
else:
    print("No sales found")
