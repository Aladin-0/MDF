import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APIClient
from apps.core.models import Outlet, Organization
from django.contrib.auth import get_user_model
User = get_user_model()
from apps.accounts.models import Customer, Ledger, LedgerGroup
from apps.inventory.models import MasterProduct, Batch
from datetime import date, timedelta
from django.utils import timezone
import uuid
from django.test import override_settings
from django.core.management import call_command

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def test_data():
    org = Organization.objects.create(name='Test Org')
    outlet = Outlet.objects.create(name='Test Outlet', organization=org)
    call_command('seed_ledgers')
    user = User.objects.create_user(phone='1234567890', name='Test User', password='password', outlet=outlet, role='admin')
    customer = Customer.objects.create(outlet=outlet, name='Test Customer', phone='9999999999')
    group = LedgerGroup.objects.get_or_create(name='Sundry Creditors', nature='liability', outlet=outlet)[0]
    supplier_ledger = Ledger.objects.create(name='Supplier X', group=group, outlet=outlet)
    product = MasterProduct.objects.create(name='Syrup XYZ', pack_size=1, pack_unit='bottle', pack_type='bottle', mrp=Decimal('150.00'), gst_rate=Decimal('12.00'))
    return {'org': org, 'outlet': outlet, 'user': user, 'customer': customer, 'supplier_ledger': supplier_ledger, 'product': product}

@pytest.mark.django_db
@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}})
def test_inventory_list_api(api_client, test_data):
    api_client.force_authenticate(user=test_data['user'])
    Batch.objects.create(outlet=test_data['outlet'], product=test_data['product'], batch_no='B001', expiry_date=date.today() + timedelta(days=365), mrp=Decimal('150.00'), purchase_rate=Decimal('100.00'), pack_size=1, pack_unit='bottle', pack_type='bottle', qty_strips=10, qty_loose=0)
    url = f'/api/v1/inventory/?outletId={test_data['outlet'].id}'
    response = api_client.get(url)
    assert response.status_code == 200, f'Expected 200 OK, got {response.status_code}. Response: {response.content}'
    data = response.json()
    assert 'data' in data
    assert len(data['data']) == 1
    assert data['data'][0]['name'] == 'Syrup XYZ'
    assert data['data'][0]['totalStock'] == 10

@pytest.mark.django_db
@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache'}})
def test_bottle_purchase_and_billing(api_client, test_data):
    api_client.force_authenticate(user=test_data['user'])
    purchase_payload = {'outletId': str(test_data['outlet'].id), 'invoiceNo': 'PURCH-001', 'invoiceDate': timezone.now().isoformat(), 'partyLedgerId': str(test_data['supplier_ledger'].id), 'subtotal': 100.0, 'taxableAmount': 100.0, 'gstAmount': 12.0, 'grandTotal': 112.0, 'amountPaid': 0, 'discountAmount': 0.0, 'cessAmount': 0.0, 'items': [{'masterProductId': str(test_data['product'].id), 'batchNo': 'B-NEW', 'expiryDate': (date.today() + timedelta(days=300)).isoformat(), 'mrp': 150.0, 'purchaseRate': 100.0, 'saleRate': 150.0, 'ptr': 100.0, 'pts': 100.0, 'qty': 5, 'freeQty': 0, 'actualQty': 5, 'pkg': 1, 'gstRate': 12.0, 'taxableAmount': 500.0, 'gstAmount': 60.0, 'discountAmount': 0.0, 'discountPct': 0.0, 'cessAmount': 0.0, 'cessPct': 0.0, 'totalAmount': 560.0}]}
    purchase_url = '/api/v1/purchases/'
    response = api_client.post(purchase_url, purchase_payload, format='json')
    assert response.status_code == 201, f'Purchase failed: {response.content}'
    batch = Batch.objects.get(batch_no='B-NEW')
    assert batch.qty_strips == 5
    assert batch.qty_loose == 0
    search_url = f'/api/v1/products/search/?q=Syrup&outletId={test_data['outlet'].id}&context=purchase'
    response = api_client.get(search_url)
    assert response.status_code == 200
    search_data = response.json()
    assert len(search_data['data']) > 0
    search_url = f'/api/v1/products/search/?q=Syrup&outletId={test_data['outlet'].id}&context=billing'
    response = api_client.get(search_url)
    assert response.status_code == 200
    search_data = response.json()
    assert len(search_data['data']) > 0
    assert search_data['data'][0]['has_stock'] == True
    sale_payload = {'outletId': str(test_data['outlet'].id), 'invoiceDate': timezone.now().isoformat(), 'customerId': str(test_data['customer'].id), 'subtotal': 150.0, 'taxableAmount': 133.93, 'cgstAmount': 8.04, 'sgstAmount': 8.04, 'igstAmount': 0, 'grandTotal': 150.0, 'amountPaid': 150.0, 'cashPaid': 150.0, 'upiPaid': 0, 'cardPaid': 0, 'items': [{'productId': str(test_data['product'].id), 'batchId': str(batch.id), 'qtyStrips': 2, 'qtyLoose': 0, 'rate': 150.0, 'mrp': 150.0, 'saleRate': 150.0, 'gstRate': 12.0, 'discountPct': 0.0, 'taxableAmount': 267.86, 'gstAmount': 32.14, 'totalAmount': 300.0}]}
    sale_url = '/api/v1/sales/'
    response = api_client.post(sale_url, sale_payload, format='json')
    assert response.status_code == 201, f'Sale failed: {response.content}'
    batch.refresh_from_db()
    assert batch.qty_strips == 3