import pytest
from django.urls import reverse
from rest_framework import status
from apps.accounts.tests.factories import OutletFactory, CustomerFactory, StaffFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory
from apps.billing.models import SaleInvoice
from apps.inventory.models import Batch
from decimal import Decimal
from django.core.management import call_command

@pytest.mark.django_db
def test_sale_create_api(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'))
    from apps.inventory.services import post_stock_ledger_entry
    import datetime
    post_stock_ledger_entry(outlet=outlet, product=product, batch=batch, txn_type='PURCHASE_IN', txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice', voucher_number='PINV-001', party_name='Supplier', qty_in=10, qty_out=0, rate=80.0)
    url = reverse('sale-list-create')
    payload = {'outletId': str(outlet.id), 'customerId': str(customer.id), 'grandTotal': '100.00', 'subtotal': '100.00', 'discountAmount': '0', 'cashPaid': '100.00', 'paymentMode': 'cash', 'invoiceDate': '2026-08-01', 'items': [{'productId': str(product.id), 'batchId': str(batch.id), 'qtyStrips': 2, 'qtyLoose': 0, 'rate': '100.00', 'gstRate': '0', 'taxableAmount': '100.00', 'gstAmount': '0'}]}
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED, response.data
    sale = SaleInvoice.objects.filter(outlet=outlet).first()
    assert sale is not None
    assert sale.grand_total == Decimal('100.00')
    batch.refresh_from_db()
    assert batch.qty_strips == 8

@pytest.mark.django_db
def test_sale_create_invalid_payload(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    url = reverse('sale-list-create')
    payload = {'outletId': str(outlet.id)}
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'items' in response.data or 'error' in response.data or 'detail' in response.data