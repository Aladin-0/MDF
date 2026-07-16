import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.billing.serializers import DraftInvoiceSerializer

data = {
    "outlet": "8ab87063-ec55-4428-b8bc-2a54b38dcdbb", # Assuming UUID
    "customer": None,
    "subtotal": 0,
    "discount_amount": 0,
    "extra_discount_pct": 0,
    "taxable_amount": 0,
    "cgst_amount": 0,
    "sgst_amount": 0,
    "round_off": 0,
    "grand_total": 0,
    "payment_mode": "cash",
    "items": []
}

serializer = DraftInvoiceSerializer(data=data)
if not serializer.is_valid():
    print(serializer.errors)
else:
    print("Valid!")
