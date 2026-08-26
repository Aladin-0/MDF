import pytest
from unittest.mock import patch
from decimal import Decimal
from django.utils import timezone
from apps.billing.sale_services import atomic_sale_save
from apps.accounts.tests.factories import OutletFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.billing.models import SaleInvoice
from apps.inventory.models import Batch, StockLedger

@pytest.mark.django_db
def test_transaction_rollback_on_error():
    outlet = OutletFactory()
    from django.core.management import call_command
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    staff = StaffFactory(outlet=outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'))
    initial_invoices = SaleInvoice.objects.count()
    initial_ledgers = StockLedger.objects.count()
    request_data = {'grandTotal': 200.0, 'subtotal': 200.0, 'discountAmount': 0, 'cashPaid': 200.0, 'paymentMode': 'cash', 'invoiceDate': timezone.now().isoformat()}
    items_data = [{'productId': str(product.id), 'batchId': str(batch.id), 'qtyStrips': 2, 'qtyLoose': 0, 'rate': '100.00', 'gstRate': '0'}]
    with patch('apps.billing.sale_services.post_stock_ledger_entry', side_effect=Exception('Synthetic error')):
        with pytest.raises(Exception, match='Synthetic error'):
            atomic_sale_save(request_data=request_data, outlet=outlet, customer=None, billed_by=staff, items_data=items_data, schedule_h_data=None, hospital_name='', doctor_id=None)
    assert SaleInvoice.objects.count() == initial_invoices
    assert StockLedger.objects.count() == initial_ledgers
    batch.refresh_from_db()
    assert batch.qty_strips == 10