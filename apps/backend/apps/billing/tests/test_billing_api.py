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
def test_sale_create_smart_caps_discount_at_cost_floor(authenticated_client):
    from apps.accounts.models import Staff
    from apps.accounts.services import LedgerService
    from apps.inventory.services import post_stock_ledger_entry
    import datetime
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    LedgerService.sync_customer_ledgers(outlet)
    product = MasterProductFactory(name='Amoxicillin 250mg')
    # Batch has MRP 100, PTR 80
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'), ptr=Decimal('80.00'), purchase_rate=Decimal('80.00'))
    post_stock_ledger_entry(outlet=outlet, product=product, batch=batch, txn_type='PURCHASE_IN', txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice', voucher_number='PINV-SC-001', party_name='Supplier', qty_in=10, qty_out=0, rate=80.0)
    
    url = reverse('sale-list-create')
    # Item rate is 90 (above PTR 80). With extraDiscountPct 20%, 90 * 0.8 = 72 (< 80).
    # Smart Cap caps final row amount at 80.00, allowing sale to succeed!
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '80.00',
        'subtotal': '90.00',
        'discountAmount': '10.00',
        'extraDiscountPct': 20.0,
        'cashPaid': '80.00',
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
    assert response.status_code == status.HTTP_201_CREATED, response.data

@pytest.mark.django_db
def test_sale_create_prevents_loss_sale_when_base_item_under_cost(authenticated_client):
    from apps.accounts.models import Staff
    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    product = MasterProductFactory(name='Under Cost Drug')
    # Batch has MRP 100, PTR 80
    batch = BatchFactory(outlet=outlet, product=product, pack_size=10, qty_strips=10, qty_loose=0, mrp=Decimal('100.00'), ptr=Decimal('80.00'), purchase_rate=Decimal('80.00'))
    
    url = reverse('sale-list-create')
    # Item rate is 70 (already below PTR 80 before extra discount).
    # Smart Cap should NOT apply because base amount < cost floor.
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '63.00',
        'subtotal': '70.00',
        'discountAmount': '30.00',
        'extraDiscountPct': 10.0,
        'cashPaid': '63.00',
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

@pytest.mark.django_db
def test_sale_create_flat_discount_reconciliation_with_smart_capping(authenticated_client):
    from apps.accounts.models import Staff
    from apps.accounts.services import LedgerService
    from apps.inventory.services import post_stock_ledger_entry
    import datetime

    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    LedgerService.sync_customer_ledgers(outlet)

    prod_low = MasterProductFactory(name='Low Margin Drug', gst_rate=Decimal('0'))
    batch_low = BatchFactory(
        outlet=outlet, product=prod_low, pack_size=1, qty_strips=10, qty_loose=0,
        mrp=Decimal('100.00'), landing_rate=Decimal('95.00')
    )
    post_stock_ledger_entry(
        outlet=outlet, product=prod_low, batch=batch_low, txn_type='PURCHASE_IN',
        txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice',
        voucher_number='PINV-LOW-01', party_name='Supplier', qty_in=10, qty_out=0, rate=95.0
    )

    prod_high = MasterProductFactory(name='High Margin Drug', gst_rate=Decimal('0'))
    batch_high = BatchFactory(
        outlet=outlet, product=prod_high, pack_size=1, qty_strips=10, qty_loose=0,
        mrp=Decimal('1000.00'), landing_rate=Decimal('500.00')
    )
    post_stock_ledger_entry(
        outlet=outlet, product=prod_high, batch=batch_high, txn_type='PURCHASE_IN',
        txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice',
        voucher_number='PINV-HIGH-01', party_name='Supplier', qty_in=10, qty_out=0, rate=500.0
    )

    url = reverse('sale-list-create')
    # Total Base: ₹1100. Customer receives flat ₹245 discount.
    # Low margin item capped at ₹95 (absorbs ₹5 discount).
    # High margin item absorbs remaining ₹240 discount (amount ₹760).
    # Grand Total = 855.
    extra_pct = Decimal(str(round((245 / 1100) * 100, 6)))
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'saleType': 'RETAIL',
        'extraDiscountPct': float(extra_pct),
        'grandTotal': '855.00',
        'subtotal': '855.00',
        'discountAmount': '245.00',
        'cashPaid': '855.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [
            {
                'productId': str(prod_low.id),
                'batchId': str(batch_low.id),
                'qtyStrips': 1,
                'qtyLoose': 0,
                'rate': '100.00',
                'gstRate': '0',
                'taxableAmount': '95.00',
                'gstAmount': '0',
                'totalAmount': '95.00',
            },
            {
                'productId': str(prod_high.id),
                'batchId': str(batch_high.id),
                'qtyStrips': 1,
                'qtyLoose': 0,
                'rate': '1000.00',
                'gstRate': '0',
                'taxableAmount': '760.00',
                'gstAmount': '0',
                'totalAmount': '760.00',
            }
        ]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED, response.data
    assert Decimal(str(response.data['grandTotal'])) == Decimal('855.00')

@pytest.mark.django_db
def test_sale_create_scheme_free_quantity_safe_harbor(authenticated_client):
    from apps.accounts.models import Staff
    from apps.accounts.services import LedgerService
    from apps.inventory.services import post_stock_ledger_entry
    import datetime

    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    LedgerService.sync_customer_ledgers(outlet)

    product = MasterProductFactory(name='Scheme Medicine', gst_rate=Decimal('0'))
    # Batch has MRP 100, landing_rate 90.00
    batch = BatchFactory(
        outlet=outlet, product=product, pack_size=1, qty_strips=20, qty_loose=0,
        mrp=Decimal('100.00'), landing_rate=Decimal('90.00')
    )
    post_stock_ledger_entry(
        outlet=outlet, product=product, batch=batch, txn_type='PURCHASE_IN',
        txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice',
        voucher_number='PINV-SCH-01', party_name='Supplier', qty_in=20, qty_out=0, rate=90.0
    )

    url = reverse('sale-list-create')
    # Buy 10 strips + 2 free strips under scheme.
    # Billed revenue = 10 * 100 = 1000.
    # 5% extra discount -> Net amount = 950.
    # Billed cost floor = 10 * 90 = 900.
    # If free strips inflated floor to 12 * 90 = 1080, it would falsely fail!
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'saleType': 'RETAIL',
        'extraDiscountPct': 5.0,
        'grandTotal': '950.00',
        'subtotal': '950.00',
        'discountAmount': '50.00',
        'cashPaid': '950.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [{
            'productId': str(product.id),
            'batchId': str(batch.id),
            'qtyStrips': 10,
            'freeQtyStrips': 2,
            'qtyLoose': 0,
            'rate': '100.00',
            'gstRate': '0',
            'taxableAmount': '950.00',
            'gstAmount': '0',
            'totalAmount': '950.00',
        }]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED, response.data
    assert Decimal(str(response.data['grandTotal'])) == Decimal('950.00')

@pytest.mark.django_db
def test_sale_create_pure_free_quantity_scheme_item(authenticated_client):
    from apps.accounts.models import Staff
    from apps.accounts.services import LedgerService
    from apps.inventory.services import post_stock_ledger_entry
    import datetime

    user = Staff.objects.first()
    outlet = user.outlet
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    customer = CustomerFactory(outlet=outlet)
    LedgerService.sync_customer_ledgers(outlet)

    prod_paid = MasterProductFactory(name='Paid Medicine', gst_rate=Decimal('0'))
    batch_paid = BatchFactory(
        outlet=outlet, product=prod_paid, pack_size=1, qty_strips=10, qty_loose=0,
        mrp=Decimal('200.00'), landing_rate=Decimal('150.00')
    )
    post_stock_ledger_entry(
        outlet=outlet, product=prod_paid, batch=batch_paid, txn_type='PURCHASE_IN',
        txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice',
        voucher_number='PINV-PAID-01', party_name='Supplier', qty_in=10, qty_out=0, rate=150.0
    )

    prod_free = MasterProductFactory(name='Promotional Sample Free', gst_rate=Decimal('0'))
    batch_free = BatchFactory(
        outlet=outlet, product=prod_free, pack_size=1, qty_strips=10, qty_loose=0,
        mrp=Decimal('50.00'), landing_rate=Decimal('30.00')
    )
    post_stock_ledger_entry(
        outlet=outlet, product=prod_free, batch=batch_free, txn_type='PURCHASE_IN',
        txn_date=datetime.date(2025, 1, 1), voucher_type='Purchase Invoice',
        voucher_number='PINV-FREE-01', party_name='Supplier', qty_in=10, qty_out=0, rate=30.0
    )

    url = reverse('sale-list-create')
    payload = {
        'outletId': str(outlet.id),
        'customerId': str(customer.id),
        'saleType': 'RETAIL',
        'grandTotal': '200.00',
        'subtotal': '200.00',
        'discountAmount': '0.00',
        'cashPaid': '200.00',
        'paymentMode': 'cash',
        'invoiceDate': '2026-08-01',
        'items': [
            {
                'productId': str(prod_paid.id),
                'batchId': str(batch_paid.id),
                'qtyStrips': 1,
                'qtyLoose': 0,
                'rate': '200.00',
                'gstRate': '0',
                'taxableAmount': '200.00',
                'gstAmount': '0',
                'totalAmount': '200.00',
            },
            {
                'productId': str(prod_free.id),
                'batchId': str(batch_free.id),
                'qtyStrips': 0,
                'freeQtyStrips': 1,
                'qtyLoose': 0,
                'rate': '0.00',
                'gstRate': '0',
                'taxableAmount': '0.00',
                'gstAmount': '0',
                'totalAmount': '0.00',
            }
        ]
    }
    response = authenticated_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED, response.data
    assert Decimal(str(response.data['grandTotal'])) == Decimal('200.00')