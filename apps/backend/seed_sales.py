import os
import django
import datetime
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings')
django.setup()

from apps.core.models import Outlet
from apps.billing.models import SaleInvoice, SaleItem, ReceiptEntry
from apps.inventory.models import Batch
from apps.accounts.models import Staff, Partner
from django.utils import timezone

outlet = Outlet.objects.first()
staff = Staff.objects.filter(outlet=outlet).first()
today = timezone.now()

# Clear existing today's invoices to avoid duplicates on reruns
SaleInvoice.objects.filter(outlet=outlet, invoice_date__date=today.date()).delete()
ReceiptEntry.objects.filter(outlet=outlet, date=today.date()).delete()

# Setup Partner splits
partners = Partner.objects.filter(outlet=outlet)
if partners.count() >= 3:
    partners[0].profit_percentage = 33
    partners[0].save()
    partners[1].profit_percentage = 33
    partners[1].save()
    partners[2].profit_percentage = 34
    partners[2].save()

# Get some batches to sell
batches = Batch.objects.filter(outlet=outlet)[:5]

inv_count = 1
def create_invoice(payment_mode, amount, is_return=False):
    global inv_count
    inv = SaleInvoice.objects.create(
        outlet=outlet,
        billed_by=staff,
        invoice_no=f"INV-TEST-{inv_count}",
        invoice_date=today,
        payment_mode=payment_mode,
        subtotal=abs(amount),
        taxable_amount=abs(amount),
        grand_total=abs(amount),
        amount_paid=abs(amount) if payment_mode != 'credit' else 0,
        amount_due=abs(amount) if payment_mode == 'credit' else 0,
        cash_paid=abs(amount) if payment_mode == 'cash' else 0,
        upi_paid=abs(amount) if payment_mode == 'upi' else 0,
        card_paid=abs(amount) if payment_mode == 'card' else 0,
        is_return=is_return
    )
    inv_count += 1
    
    # Just add a dummy item to give it some profit
    # cost_price = 50% of amount
    if batches:
        b = batches[0]
        # In mediflow, profit is calculated somewhere? Actually, DailySnapshot uses
        # SaleInvoiceItem cost_price or purchase_rate. Let's see if we need to create an item.
        SaleItem.objects.create(
            invoice=inv,
            batch=b,
            product_name="Test Product",
            pack_size=1,
            pack_unit="strip",
            schedule_type="OTC",
            batch_no="B1",
            expiry_date=timezone.now().date() + timezone.timedelta(days=365),
            mrp=abs(amount),
            sale_rate=abs(amount),
            rate=abs(amount),
            qty_strips=1 if not is_return else -1,
            qty_loose=0,
            gst_rate=0,
            taxable_amount=abs(amount),
            gst_amount=0,
            total_amount=abs(amount)
        )
    return inv

# Create Sales
create_invoice('cash', 50000)
create_invoice('upi', 20000)
create_invoice('card', 15000)
create_invoice('credit', 25000)

# Create Return (is_return=True)
create_invoice('cash', -5000, is_return=True) # Wait, is amount negative for return or just is_return=True?
# Actually daily snapshot does: if is_return: amount. Let's pass positive amount and is_return=True
create_invoice('cash', 5000, is_return=True) 

from apps.accounts.models import Customer
customer = Customer.objects.filter(outlet=outlet).first()
if not customer:
    customer = Customer.objects.create(outlet=outlet, name="Test Customer")

# Create Customer Jama (ReceiptEntry)
ReceiptEntry.objects.create(
    outlet=outlet,
    customer=customer,
    date=today.date(),
    total_amount=10000,
    payment_mode='cash',
    notes='Customer Jama Test',
    created_by=staff
)

print('Seeded realistic data for today!')
