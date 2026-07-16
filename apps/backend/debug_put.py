import os
import django
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.billing.sale_return_update_service import atomic_sale_return_update
from apps.billing.models import SalesReturn

sr = SalesReturn.objects.get(id="76ff2bc6-080e-4949-b9ad-d4bcaec92846")
item = sr.items.first()

payload = {
    "outletId": str(sr.outlet_id),
    "originalSaleId": str(sr.original_sale_id),
    "returnDate": sr.return_date.isoformat(),
    "refundMode": sr.refund_mode,
    "reason": sr.reason or "Modifying",
    "totalAmount": 100,
    "revisionReasonCode": "EDIT_RETURN",
    "revisionReasonText": "Edited Sales Return via UI",
    "items": [
        {
            "originalSaleItemId": str(item.original_sale_item_id),
            "batchId": str(item.batch_id),
            "qtyReturned": 2,
            "returnRate": float(item.return_rate),
            "totalAmount": 100
        }
    ]
}

print("Running update...")
try:
    # Assume admin user
    from django.contrib.auth import get_user_model
    User = get_user_model()
    admin = User.objects.filter(role="super_admin").first()
    atomic_sale_return_update(
        return_id=str(sr.id),
        payload=payload,
        outlet_id=str(sr.outlet_id),
        updated_by_id=str(admin.id)
    )
    print("Success!")
except Exception as e:
    import traceback
    traceback.print_exc()
