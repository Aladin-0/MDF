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
    from apps.accounts.services import LedgerService
    LedgerService.sync_customer_ledgers(outlet)
    product = MasterProductFactory()
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'), purchase_rate=Decimal('40.00'), ptr=Decimal('40.00'))
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

@pytest.mark.django_db
def test_sale_create_prevents_loss_sale_below_ptr(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory(name='Paracetamol 500mg')
    # Batch has MRP 100, PTR 80
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'), ptr=Decimal('80.00'), purchase_rate=Decimal('80.00'))
    
    url = reverse('sale-list-create')
    # Attempt to sell at 70 (below PTR 80)
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '70.00',
        'subtotal': '70.00',
        'discountAmount': '30.00',
        'cashPaid': '70.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [{
            'productId': str(product.id),
            'batchId': str(batch.id),
            'qtyStrips': 1,
            'qtyLoose': 0,
            'rate': '70.00',
            'gstRate': '0',
            'taxableAmount': '70.00',
            'gstAmount': '0',
            'totalAmount': '70.00',
        }]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Loss Sale Prevented' in response.data['detail']
    assert 'below its landing cost of ₹80.00' in response.data['detail']

@pytest.mark.django_db
def test_sale_create_prevents_loss_sale_via_bill_discount(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory(name='Amoxicillin 250mg')
    # Batch has MRP 100, PTR 80
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'), ptr=Decimal('80.00'), purchase_rate=Decimal('80.00'))
    
    url = reverse('sale-list-create')
    # Item rate is 90, but extraDiscountPct is 20%, bringing net selling rate to 90 * 0.8 = 72 (below PTR 80)
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '72.00',
        'subtotal': '90.00',
        'discountAmount': '10.00',
        'extraDiscountPct': 20.0,
        'cashPaid': '72.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [{
            'productId': str(product.id),
            'batchId': str(batch.id),
            'qtyStrips': 1,
            'qtyLoose': 0,
            'rate': '90.00',
            'gstRate': '0',
            'taxableAmount': '90.00',
            'gstAmount': '0',
            'totalAmount': '90.00',
        }]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Loss Sale Prevented' in response.data['detail']
    assert 'below its landing cost of ₹80.00' in response.data['detail']

@pytest.mark.django_db
def test_sale_create_uses_landing_rate_strictly(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory(name='Cefixime 200mg')
    # Batch has MRP 120, PTR 70, landing_rate 85.00
    batch = BatchFactory(
        outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0,
        mrp=Decimal('120.00'), ptr=Decimal('70.00'), landing_rate=Decimal('85.00'), purchase_rate=Decimal('70.00')
    )
    
    url = reverse('sale-list-create')
    # Sell at 78 (which is > PTR 70, but < landing_rate 85) -> should be blocked by landing_rate!
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '78.00',
        'subtotal': '78.00',
        'discountAmount': '0.00',
        'cashPaid': '78.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [{
            'productId': str(product.id),
            'batchId': str(batch.id),
            'qtyStrips': 1,
            'qtyLoose': 0,
            'rate': '78.00',
            'gstRate': '0',
            'taxableAmount': '78.00',
            'gstAmount': '0',
            'totalAmount': '78.00',
        }]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Loss Sale Prevented' in response.data['detail']
    assert 'below its landing cost of ₹85.00' in response.data['detail']

@pytest.mark.django_db
def test_sale_create_wholesale_allows_sale_above_purchase_rate_even_if_below_landing(authenticated_client):
    from apps.accounts.models import Staff
    from apps.inventory.services import post_stock_ledger_entry
    import datetime
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    from apps.accounts.services import LedgerService
    LedgerService.sync_customer_ledgers(outlet)
    product = MasterProductFactory(name='Wholesale Medicine')
    # Batch has MRP 120, landing_rate 85.00, purchase_rate 60.00
    batch = BatchFactory(
        outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0,
        mrp=Decimal('120.00'), ptr=Decimal('75.00'), landing_rate=Decimal('85.00'), purchase_rate=Decimal('60.00')
    )
    post_stock_ledger_entry(
        outlet=outlet, product=product, batch=batch, txn_type='PURCHASE_IN',
        txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice',
        voucher_number='PINV-WS-001', party_name='Supplier', qty_in=10, qty_out=0, rate=60.0
    )

    url = reverse('sale-list-create')
    # Sell at 70 in WHOLESALE mode:
    # 70 is > purchase_rate 60.00, but < landing_rate 85.00.
    # In WHOLESALE mode, floor is purchase_rate (60.00), so this must succeed!
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'saleType': 'WHOLESALE',
        'grandTotal': '70.00',
        'subtotal': '70.00',
        'discountAmount': '0.00',
        'cashPaid': '70.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [{
            'productId': str(product.id),
            'batchId': str(batch.id),
            'qtyStrips': 1,
            'qtyLoose': 0,
            'rate': '70.00',
            'gstRate': '0',
            'taxableAmount': '70.00',
            'gstAmount': '0',
            'totalAmount': '70.00',
        }]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED, response.data

@pytest.mark.django_db
def test_sale_create_wholesale_prevents_loss_sale_below_purchase_rate(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory(name='Wholesale Loss Product')
    # Batch has MRP 120, landing_rate 85.00, purchase_rate 60.00
    batch = BatchFactory(
        outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0,
        mrp=Decimal('120.00'), ptr=Decimal('75.00'), landing_rate=Decimal('85.00'), purchase_rate=Decimal('60.00')
    )

    url = reverse('sale-list-create')
    # Sell at 55 in WHOLESALE mode (below purchase_rate 60.00)
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'saleType': 'WHOLESALE',
        'grandTotal': '55.00',
        'subtotal': '55.00',
        'discountAmount': '0.00',
        'cashPaid': '55.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [{
            'productId': str(product.id),
            'batchId': str(batch.id),
            'qtyStrips': 1,
            'qtyLoose': 0,
            'rate': '55.00',
            'gstRate': '0',
            'taxableAmount': '55.00',
            'gstAmount': '0',
            'totalAmount': '55.00',
        }]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Loss Sale Prevented' in response.data['detail']
    assert 'below its purchase rate of ₹60.00' in response.data['detail']