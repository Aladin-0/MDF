import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from apps.accounts.tests.factories import OutletFactory, SupplierFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.purchases.models import PurchaseInvoice
from apps.inventory.models import Batch, StockLedger
from decimal import Decimal
from django.core.management import call_command
from django.db import transaction
import concurrent.futures
import datetime

@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
def test_purchase_edit_concurrency():
    """
    Test that two parallel edits to the same purchase invoice don't cause duplicate 
    stock ledger entries or corrupt the batch quantities.
    """
    outlet = OutletFactory()
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    distributor = SupplierFactory(outlet=outlet)
    from apps.accounts.tests.factories import LedgerFactory
    distributor_ledger = LedgerFactory(outlet=outlet, name=distributor.name)
    product = MasterProductFactory()
    
    # Needs to be committed to DB for threaded testing (hence transaction=True and create via client)
    client1 = APIClient()
    user = StaffFactory(outlet=outlet, role='super_admin')
    user.set_password('testpass123')
    user.save()
    client1.force_authenticate(user=user)
    
    # Create the initial purchase
    url = reverse('purchase-list-create')
    payload = {
        'outletId': str(outlet.id),
        'distributorId': str(distributor.id),
        'partyLedgerId': str(distributor_ledger.id),
        'invoiceNo': 'INV-CONCURRENCY-1',
        'invoiceDate': '2026-08-01',
        'subtotal': '100.00',
        'discountAmount': '0',
        'taxableAmount': '100.00',
        'gstAmount': '12.00',
        'cessAmount': '0',
        'grandTotal': '112.00',
        'items': [
            {
                'productId': str(product.id),
                'batchNo': 'BATCH-CONC',
                'expiryDate': '2030-12-31',
                'packSize': 10,
                'qty': 10,
                'actualQty': 10,
                'qtyLoose': 0,
                'purchaseRate': '10.00',
                'ptr': '10.00',
                    'pts': '10.00',
                    'mrp': '15.00',
                    'saleRate': '15.00',
                'gstRate': '12.00',
                'taxableAmount': '100.00',
                'gstAmount': '12.00',
                'totalAmount': '112.00',
            }
        ]
    }
    
    response = client1.post(url, payload, format='json')
    assert response.status_code == 201
    purchase_id = response.data['id']
    
    # We will simulate 2 users modifying the invoice simultaneously
    client2 = APIClient()
    client2.force_authenticate(user=user)
    
    update_url = reverse('purchase-detail', kwargs={'purchase_id': purchase_id})
    
    # Payload 1: Update qty to 20
    payload1 = {
        'outletId': str(outlet.id),
        'distributorId': str(distributor.id),
        'partyLedgerId': str(distributor_ledger.id),
        'invoiceNo': 'INV-CONCURRENCY-1',
        'invoiceDate': '2026-08-01',
        'revisionReasonCode': 'CORRECTION',
        'revisionReasonText': 'Updating quantity to fix mistake',
        'subtotal': '200.00',
        'discountAmount': '0',
        'taxableAmount': '200.00',
        'gstAmount': '24.00',
        'cessAmount': '0',
        'grandTotal': '224.00',
        'items': [
            {
                'productId': str(product.id),
                'batchNo': 'BATCH-CONC',
                'expiryDate': '2030-12-31',
                'packSize': 10,
                'qty': 20,
                'actualQty': 20,
                'qtyLoose': 0,
                'purchaseRate': '10.00',
                'ptr': '10.00',
                    'pts': '10.00',
                    'mrp': '15.00',
                    'saleRate': '15.00',
                'gstRate': '12.00',
                'taxableAmount': '200.00',
                'gstAmount': '24.00',
                'totalAmount': '224.00',
            }
        ]
    }
    
    # Payload 2: Update qty to 30
    payload2 = {
        'outletId': str(outlet.id),
        'distributorId': str(distributor.id),
        'partyLedgerId': str(distributor_ledger.id),
        'invoiceNo': 'INV-CONCURRENCY-1',
        'invoiceDate': '2026-08-01',
        'revisionReasonCode': 'CORRECTION',
        'revisionReasonText': 'Updating quantity to fix mistake again',
        'subtotal': '300.00',
        'discountAmount': '0',
        'taxableAmount': '300.00',
        'gstAmount': '36.00',
        'cessAmount': '0',
        'grandTotal': '336.00',
        'items': [
            {
                'productId': str(product.id),
                'batchNo': 'BATCH-CONC',
                'expiryDate': '2030-12-31',
                'packSize': 10,
                'qty': 30,
                'actualQty': 30,
                'qtyLoose': 0,
                'purchaseRate': '10.00',
                'ptr': '10.00',
                    'pts': '10.00',
                    'mrp': '15.00',
                    'saleRate': '15.00',
                'gstRate': '12.00',
                'taxableAmount': '300.00',
                'gstAmount': '36.00',
                'totalAmount': '336.00',
            }
        ]
    }

    # Execute requests concurrently
    def make_request(c, p):
        return c.put(update_url, p, format='json')
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_request, client1, payload1)
        f2 = executor.submit(make_request, client2, payload2)
        
        # Wait for both
        r1 = f1.result()
        r2 = f2.result()
        
    # Check that at least one succeeded (one might fail depending on row locking)
    # The ultimate invariant is that the stock ledger isn't duplicated
    batch = Batch.objects.get(product=product, batch_no='BATCH-CONC')
    
    # Batch qty should be exactly 20 or 30 (not some mix, and not corrupted)
    assert batch.qty_strips in [20, 30]
    
    # Count stock ledger entries for this batch. 
    # There should only be ONE entry per transaction. Since we created it initially (1 entry),
    # and then an update will generate a reversal (-10) and a new one (+20 or +30).
    # If both updates hit without locking, we might see multiple reversals.
    # We verify no duplicates exist by ensuring final qty matches the net ledgers exactly.
    ledgers = StockLedger.objects.filter(batch=batch)
    net_qty = sum(l.qty_in - l.qty_out for l in ledgers)
    assert batch.qty_strips == net_qty
