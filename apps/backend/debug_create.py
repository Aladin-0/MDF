import os
import django
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.billing.payment_services import create_sales_return
from apps.billing.models import SaleInvoice

# Pick any existing sale
sale = SaleInvoice.objects.last()
if not sale:
    print("No sale found")
    exit(0)

item = sale.items.first()
if not item:
    print("No items in sale")
    exit(0)

payload = {
    "originalSaleId": str(sale.id),
    "returnDate": "2026-07-07T00:00:00Z",
    "refundMode": "cash",
    "reason": "Test Create Return",
    "items": [
        {
            "saleItemId": str(item.id),
            "batchId": str(item.batch_id),
            "qtyReturned": 1,
            "returnRate": float(item.rate),
        }
    ]
}

from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.first()

try:
    print("Testing create_sales_return...")
    sr = create_sales_return(payload, str(sale.outlet_id), str(user.id))
    print(f"Success: {sr.id}")
except Exception as e:
    import traceback
    traceback.print_exc()
