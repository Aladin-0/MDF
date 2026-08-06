import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.purchases.models import PurchaseInvoice

print("Total Purchases:", PurchaseInvoice.objects.count())
for p in PurchaseInvoice.objects.order_by('-created_at')[:5]:
    print(f"ID: {p.id}, Outlet: {p.outlet_id}, InvoiceDate: {p.invoice_date}, CreatedAt: {p.created_at}")
