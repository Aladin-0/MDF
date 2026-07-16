import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from apps.billing.models import SaleInvoice
from apps.billing.serializers import SaleInvoiceSerializer

sale = SaleInvoice.objects.last()
if sale:
    print(f"Sale ID: {sale.id}")
    print(f"Customer: {sale.customer}")
    print(f"Doctor: {sale.doctor}")
    print(f"Hospital: {sale.hospital_name}")
    print(f"Prescription: {sale.prescription_no}")
else:
    print("No sales found")
