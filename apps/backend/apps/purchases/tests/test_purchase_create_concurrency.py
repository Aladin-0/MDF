import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from apps.accounts.tests.factories import OutletFactory, SupplierFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory
from apps.purchases.models import PurchaseInvoice
from apps.inventory.models import StockLedger
from django.core.management import call_command
import concurrent.futures

@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
def test_purchase_create_concurrency():
    """
    Test simultaneous creation of a purchase invoice with the exact same invoice number
    to verify unique constraints and double-ledger prevention.
    """
    outlet = OutletFactory()
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    distributor = SupplierFactory(outlet=outlet)
    from apps.accounts.tests.factories import LedgerFactory
    distributor_ledger = LedgerFactory(outlet=outlet, name=distributor.name)
    product = MasterProductFactory()
    client1 = APIClient()
    user = StaffFactory(outlet=outlet, role='super_admin')
    user.set_password('testpass123')
    user.save()
    client1.force_authenticate(user=user)
    client2 = APIClient()
    client2.force_authenticate(user=user)
    url = reverse('purchase-list-create')
    payload = {'outletId': str(outlet.id), 'distributorId': str(distributor.id), 'partyLedgerId': str(distributor_ledger.id), 'invoiceNo': 'INV-CREATE-CONC-1', 'invoiceDate': '2026-08-01', 'subtotal': '100.00', 'discountAmount': '0', 'taxableAmount': '100.00', 'gstAmount': '12.00', 'cessAmount': '0', 'grandTotal': '112.00', 'items': [{'productId': str(product.id), 'batchNo': 'BATCH-CONC-CREATE', 'expiryDate': '2030-12-31', 'packSize': 10, 'qty': 10, 'actualQty': 10, 'qtyLoose': 0, 'purchaseRate': '10.00', 'ptr': '10.00', 'pts': '10.00', 'mrp': '15.00', 'saleRate': '15.00', 'gstRate': '12.00', 'taxableAmount': '100.00', 'gstAmount': '12.00', 'totalAmount': '112.00'}]}

    def make_request(c):
        return c.post(url, payload, format='json')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_request, client1)
        f2 = executor.submit(make_request, client2)
        r1 = f1.result()
        r2 = f2.result()
    statuses = [r1.status_code, r2.status_code]
    assert 201 in statuses
    assert statuses.count(201) == 1
    invoices = PurchaseInvoice.objects.filter(invoice_no='INV-CREATE-CONC-1')
    assert invoices.count() == 1
    ledgers = StockLedger.objects.filter(batch__batch_no='BATCH-CONC-CREATE')
    assert ledgers.count() == 1