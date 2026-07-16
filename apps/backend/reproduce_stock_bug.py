import os
import django
from decimal import Decimal
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "True"
django.setup()

from apps.core.models import Outlet
from apps.accounts.models import Staff
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem
from apps.inventory.services import post_stock_ledger_entry
from apps.billing.payment_services import create_sales_return
from apps.billing.sale_return_update_service import atomic_sale_return_update
from django.db import transaction

def print_ledger(batch):
    print("--- Stock Ledger for", batch.batch_no, "---")
    for sl in StockLedger.objects.filter(batch=batch).order_by('created_at'):
        print(f"{sl.txn_type:15} | IN: {sl.qty_in:4} OUT: {sl.qty_out:4} | RUN: {sl.running_qty:4}")
    print("---------------------------------------")

def reproduce():
    outlet = Outlet.objects.first()
    admin = Staff.objects.first()
    
    with transaction.atomic():
        # Create a product and batch
        product = MasterProduct.objects.create(name="Bug Reproducer Product", pack_size=1)
        batch = Batch.objects.create(
            outlet=outlet, product=product, batch_no="BUG-BATCH-1",
            pack_size=1, qty_strips=15, qty_loose=0, expiry_date="2030-01-01",
            mrp=100, purchase_rate=80, sale_rate=100
        )
        post_stock_ledger_entry(outlet, product, batch, 'PURCHASE_IN', date.today(), 'Opening', 'OPEN-1', 'Vendor', 15, 0, 80)
        
        sale = SaleInvoice.objects.create(
            outlet=outlet, billed_by=admin, invoice_date=date.today(), 
            subtotal=500, taxable_amount=500, grand_total=500, amount_paid=500,
            cash_paid=500, payment_mode='cash'
        )
        sale_item = SaleItem.objects.create(
            invoice=sale, product_name=product.name, batch=batch, pack_size=1,
            qty_strips=5, qty_loose=0, rate=100, total_amount=500, expiry_date="2030-01-01",
            mrp=100, sale_rate=100, batch_no="BUG-BATCH-1", taxable_amount=500,
            pack_unit="strip", schedule_type="OTC"
        )
        # decrease stock
        batch.qty_strips -= 5
        batch.save()
        post_stock_ledger_entry(outlet, product, batch, 'SALE_OUT', date.today(), 'Sale', sale.invoice_no, 'Walk-in', 0, 5, 100, sale)
        
        print("After Sale:")
        print_ledger(batch)
        
        # Return 5 tablets (full return)
        payload = {
            'returnDate': str(date.today()),
            'refundMode': 'cash',
            'reason': 'test',
            'items': [{
                'saleItemId': str(sale_item.id),
                'batchId': str(batch.id),
                'qtyReturned': 5,
                'returnRate': 100,
            }]
        }
        ret = create_sales_return(outlet, sale.id, payload, admin)
        
        print("After Full Return:")
        print_ledger(batch)
        
        # Modify return to 2 tablets
        update_payload = {
            'returnDate': str(date.today()),
            'refundMode': 'cash',
            'reason': 'test update',
            'totalAmount': 200,
            'items': [{
                'originalSaleItemId': str(sale_item.id),
                'batchId': str(batch.id),
                'qtyReturned': 2,
                'returnRate': 100,
                'totalAmount': 200,
            }]
        }
        atomic_sale_return_update(str(ret.id), update_payload, str(outlet.id), str(admin.id))
        
        print("After Modification (5 -> 2):")
        print_ledger(batch)
        
if __name__ == '__main__':
    reproduce()
