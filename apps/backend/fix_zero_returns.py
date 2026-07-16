import os
import django
from decimal import Decimal

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.billing.models import SalesReturn, SalesReturnItem

def fix_returns():
    items = SalesReturnItem.objects.filter(total_amount=0, qty_returned__gt=0)
    for item in items:
        sale_item = item.original_sale_item
        pack_size = sale_item.pack_size or 1
        
        # Effective rate is total_amount / total_fractional_strips
        qty_fractional = float(sale_item.qty_strips) + (float(sale_item.qty_loose) / pack_size)
        effective_rate = float(sale_item.total_amount) / qty_fractional if qty_fractional > 0 else 0.0
        
        # update return_rate
        item.return_rate = Decimal(str(effective_rate))
        item.total_amount = Decimal(str(item.qty_returned)) * item.return_rate / pack_size
        item.save()
        
        print(f"Fixed item {item.id} -> amount: {item.total_amount}")
        
        # update parent
        ret = item.sales_return
        ret.total_amount = sum(i.total_amount for i in ret.items.all())
        ret.save()
        print(f"Fixed return {ret.return_no} -> amount: {ret.total_amount}")

if __name__ == '__main__':
    fix_returns()
