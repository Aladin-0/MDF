import pytest
from django.urls import reverse
from rest_framework import status
from apps.accounts.tests.factories import OutletFactory, SupplierFactory, LedgerFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.purchases.models import PurchaseInvoice
from apps.inventory.models import Batch
from decimal import Decimal
from django.core.management import call_command

@pytest.mark.django_db
def test_purchase_create_api(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    distributor = SupplierFactory(outlet=outlet)
    distributor_ledger = LedgerFactory(outlet=outlet, name=distributor.name)
    product = MasterProductFactory()
    url = reverse('purchase-list-create')
    payload = {'outletId': str(outlet.id), 'distributorId': str(distributor.id), 'partyLedgerId': str(distributor_ledger.id), 'invoiceNo': 'INV-12345', 'invoiceDate': '2026-08-01', 'subtotal': '100.00', 'discountAmount': '0', 'taxableAmount': '100.00', 'gstAmount': '12.00', 'cessAmount': '0', 'grandTotal': '112.00', 'items': [{'productId': str(product.id), 'batchNo': 'BATCH-001', 'expiryDate': '2030-12-31', 'packSize': 10, 'qty': 10, 'actualQty': 10, 'qtyLoose': 0, 'freeQty': 0, 'freeLoose': 0, 'purchaseRate': '10.00', 'ptr': '10.00', 'pts': '10.00', 'mrp': '15.00', 'saleRate': '15.00', 'gstRate': '12.00', 'taxableAmount': '100.00', 'gstAmount': '12.00', 'totalAmount': '112.00'}]}
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED, response.data
    purchase = PurchaseInvoice.objects.get(invoice_no='INV-12345')
    assert purchase.grand_total == Decimal('112.00')
    batch = Batch.objects.filter(product=product, batch_no='BATCH-001').first()
    assert batch is not None
    assert batch.qty_strips == 10

@pytest.mark.django_db
def test_purchase_update_api(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    distributor = SupplierFactory(outlet=outlet)
    distributor_ledger = LedgerFactory(outlet=outlet, name=distributor.name)
    product = MasterProductFactory()
    url = reverse('purchase-list-create')
    payload = {'outletId': str(outlet.id), 'distributorId': str(distributor.id), 'partyLedgerId': str(distributor_ledger.id), 'invoiceNo': 'INV-999', 'invoiceDate': '2026-08-01', 'subtotal': '100.00', 'discountAmount': '0', 'taxableAmount': '100.00', 'gstAmount': '12.00', 'cessAmount': '0', 'grandTotal': '112.00', 'items': [{'productId': str(product.id), 'batchNo': 'BATCH-002', 'expiryDate': '2030-12-31', 'packSize': 10, 'qty': 10, 'actualQty': 10, 'qtyLoose': 0, 'freeQty': 0, 'freeLoose': 0, 'purchaseRate': '10.00', 'ptr': '10.00', 'pts': '10.00', 'mrp': '15.00', 'saleRate': '15.00', 'gstRate': '12.00', 'taxableAmount': '100.00', 'gstAmount': '12.00', 'totalAmount': '112.00'}]}
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED
    purchase_id = response.data['id']
    update_url = reverse('purchase-detail', kwargs={'purchase_id': purchase_id})
    update_payload = {'outletId': str(outlet.id), 'distributorId': str(distributor.id), 'partyLedgerId': str(distributor_ledger.id), 'invoiceNo': 'INV-999-REV', 'invoiceDate': '2026-08-02', 'revisionReasonCode': 'CORRECTION', 'revisionReasonText': 'Corrected quantity to 20 due to entry error', 'subtotal': '200.00', 'discountAmount': '0', 'taxableAmount': '200.00', 'gstAmount': '24.00', 'cessAmount': '0', 'grandTotal': '224.00', 'items': [{'productId': str(product.id), 'batchNo': 'BATCH-002', 'expiryDate': '2030-12-31', 'packSize': 10, 'qty': 20, 'actualQty': 20, 'qtyLoose': 0, 'freeQty': 0, 'freeLoose': 0, 'purchaseRate': '10.00', 'ptr': '10.00', 'pts': '10.00', 'mrp': '15.00', 'saleRate': '15.00', 'gstRate': '12.00', 'taxableAmount': '200.00', 'gstAmount': '24.00', 'totalAmount': '224.00'}]}
    response2 = authenticated_client.put(update_url, update_payload, format='json')
    assert response2.status_code == status.HTTP_200_OK, response2.data
    purchase = PurchaseInvoice.objects.get(id=purchase_id)
    assert purchase.invoice_no == 'INV-999-REV'
    assert purchase.grand_total == Decimal('224.00')
    batch = Batch.objects.get(product=product, batch_no='BATCH-002')
    assert batch.qty_strips == 20