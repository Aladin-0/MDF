import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings")
django.setup()

from apps.billing.models import SaleInvoice

sale = SaleInvoice.objects.get(invoice_no='INV-2026-000100')
doctor_data = {
    'id': str(sale.doctor.id),
    'name': sale.doctor.name,
    'reg_no': sale.doctor.reg_no,
} if sale.doctor else None

print("Doctor Data:", doctor_data)
