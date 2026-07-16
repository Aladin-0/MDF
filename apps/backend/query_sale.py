import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings")
django.setup()

from apps.billing.models import SaleInvoice

# Let's get the invoice that starts with ca672b31
invoices = SaleInvoice.objects.filter(id__startswith='ca672b31')
if not invoices.exists():
    # If not found by uuid prefix, maybe it was in invoice_no?
    invoices = SaleInvoice.objects.filter(invoice_no__icontains='CA672B31')
    
for sale in invoices:
    print(f"Sale ID: {sale.id}")
    print(f"Invoice No: {sale.invoice_no}")
    print(f"Doctor: {sale.doctor}")
    print(f"Hospital Name: {sale.hospital_name}")
    print(f"Prescription No: {sale.prescription_no}")
