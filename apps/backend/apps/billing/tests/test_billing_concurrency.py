import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from apps.accounts.tests.factories import OutletFactory, CustomerFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.inventory.models import Batch, StockLedger
from decimal import Decimal
from django.core.management import call_command
from django.db import transaction
import concurrent.futures
import datetime

@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
def test_sale_creation_concurrency():
    """
    Test that two parallel sales trying to buy from the same batch with limited
    stock correctly handle race conditions via select_for_update, preventing negative stock.
    """
    outlet = OutletFactory()
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory()
    
    # Create batch with exactly 5 strips
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=5, qty_loose=0, mrp=Decimal('100.00'))

    # Build up initial stock in ledger
    from apps.inventory.services import post_stock_ledger_entry
    with transaction.atomic():
        post_stock_ledger_entry(
            outlet=outlet,
            product=product,
            batch=batch,
            txn_type='PURCHASE_IN',
            txn_date=datetime.date(2025, 1, 1),
            voucher_type='Purchase Invoice',
            voucher_number='PINV-001',
            party_name='Supplier',
            qty_in=5,
            qty_out=0,
            rate=80.00
        )

    url = reverse('sale-list-create')
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '400.00',
        'subtotal': '400.00',
        'discountAmount': '0',
        'cashPaid': '400.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [
            {
                'productId': str(product.id),
                'batchId': str(batch.id),
                'qtyStrips': 4,
                'qtyLoose': 0,
                'rate': '100.00',
                'gstRate': '0',
                'taxableAmount': '400.00',
                'gstAmount': '0',
            }
        ]
    }
    
    # Needs to be committed to DB for threaded testing (hence transaction=True and create via client)
    user = StaffFactory(outlet=outlet, role='super_admin')
    user.set_password('testpass123')
    user.save()
    
    client1 = APIClient()
    client1.force_authenticate(user=user)
    
    client2 = APIClient()
    client2.force_authenticate(user=user)

    def make_request(c, p):
        return c.post(url, p, format='json')
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_request, client1, payload)
        f2 = executor.submit(make_request, client2, payload)
        
        r1 = f1.result()
        r2 = f2.result()
        
    # Assert that exactly ONE succeeds and ONE fails due to stock limits
    status_codes = [r1.status_code, r2.status_code]
    assert 201 in status_codes, f"Neither request succeeded. Responses: {r1.data}, {r2.data}"
    assert 400 in status_codes, f"Both requests succeeded, which shouldn't happen! Race condition failure."
    
    # Assert final batch quantity is exactly 1
    batch.refresh_from_db()
    assert batch.qty_strips == 1
