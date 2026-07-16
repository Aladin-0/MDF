import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from django.db.models import Count
from apps.billing.models import SaleInvoice, SalesReturn

# Find invoices that have more than one SalesReturn
duplicates = SalesReturn.objects.values('original_sale_id').annotate(
    return_count=Count('id')
).filter(return_count__gt=1)

report = []
for dup in duplicates:
    invoice_id = dup['original_sale_id']
    invoice = SaleInvoice.objects.get(id=invoice_id)
    returns = SalesReturn.objects.filter(original_sale_id=invoice_id).order_by('created_at')
    
    returns_data = []
    for r in returns:
        returns_data.append({
            'return_no': r.return_no,
            'return_date': str(r.return_date),
            'created_at': str(r.created_at),
            'total_amount': float(r.total_amount)
        })
        
    report.append({
        'invoice_no': invoice.invoice_no,
        'invoice_id': str(invoice.id),
        'duplicate_returns': returns_data
    })

print(json.dumps(report, indent=2))
