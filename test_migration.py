import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.dev')
django.setup()

from finance.models import Voucher, JournalEntry
from sales.models import SaleInvoice

inv = SaleInvoice.objects.filter(voucher_number='INV-2026-000206').first()
if not inv:
    inv = SaleInvoice.objects.first()

if inv:
    print(f"Invoice: {inv.voucher_number}, amount_due: {inv.amount_due}")
    vouchers = Voucher.objects.filter(entries__invoice=inv).distinct()
    for v in vouchers:
        print(f"Voucher: {v.voucher_number}")
else:
    print("No invoice found.")
