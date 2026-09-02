import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
django.setup()

from datetime import date
from apps.billing.models import SaleInvoice
from apps.reports.gst_snapshot_service import create_sale_snapshots
from apps.reports.models import GSTTransactionSnapshot

today = date.today()
# Get invoices from today
invoices = SaleInvoice.objects.filter(invoice_date__date=today, is_return=False)
count = 0
for inv in invoices:
    # check if snapshot exists
    exists = GSTTransactionSnapshot.objects.filter(document_id=inv.id, transaction_type='sale').exists()
    if not exists:
        create_sale_snapshots(inv)
        count += 1
        print(f"Created snapshot for Invoice {inv.invoice_no}")

print(f"Total missing snapshots created: {count}")
