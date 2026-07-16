import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.billing.models import SalesReturn
from django.core.exceptions import ValidationError

print("Latest SalesReturns:")
for sr in SalesReturn.objects.order_by('-created_at')[:3]:
    print(sr.id, sr.return_no, sr.refund_mode)
    print("Items:")
    for item in sr.items.all():
        print(f"  {item.original_sale_item_id} | {item.batch_id} | qty: {item.qty_returned}")
