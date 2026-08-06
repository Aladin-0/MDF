import os
import sys
import django

# Setup Django
sys.path.append(os.path.join(os.getcwd(), 'apps/backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
# I'll let base.py resolve it from .env since the user ran it manually
django.setup()

from apps.purchases.models import PurchaseInvoice
from apps.core.models import Outlet

def trace():
    print("--- Database Trace ---")
    outlets = Outlet.objects.all()
    for o in outlets:
        print(f"Outlet: {o.name} (ID: {o.id})")
        invoices = PurchaseInvoice.objects.filter(outlet=o).order_by('-created_at')[:5]
        for inv in invoices:
            print(f"  - Invoice: {inv.invoice_no}, Date: {inv.invoice_date}, Created: {inv.created_at}")

if __name__ == '__main__':
    trace()
