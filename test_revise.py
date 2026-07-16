import os
import django
import json
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.prod")
django.setup()

from apps.billing.models import SaleInvoice
from apps.billing.sale_update_service import atomic_sale_update, SaleServiceError

invoice = SaleInvoice.objects.get(invoice_no='INV-2026-000100')

payload = {
    'revisionAction': 'header_correction',
    'grandTotal': float(invoice.grand_total),
    'items': [{} for _ in range(invoice.items.count())],
    'cashPaid': float(invoice.cash_paid),
    'upiPaid': float(invoice.upi_paid),
    'cardPaid': float(invoice.card_paid),
    'creditGiven': float(invoice.credit_given)
}

try:
    updated = atomic_sale_update(str(invoice.id), payload, str(invoice.outlet_id), str(invoice.billed_by_id))
    print("Success")
except SaleServiceError as e:
    print(f"SaleServiceError: {e}")
except Exception as e:
    print(f"Exception: {e}")
