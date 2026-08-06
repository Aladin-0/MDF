
import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from apps.inventory.models import Batch, StockLedger
from apps.billing.models import SaleInvoice
import concurrent.futures
from unittest.mock import patch
from apps.accounts.tests.factories import CustomerFactory

import uuid

@pytest.fixture
def api_client(inventory_outlet):
    from apps.accounts.tests.factories import StaffFactory
    staff = StaffFactory(outlet=inventory_outlet, role="admin")
    client = APIClient()
    client.force_authenticate(user=staff)
    return client

@pytest.mark.django_db
def test_no_negative_stock(api_client, strip_batch):
    # Attempt to deduct more stock than available (via adjustment)
    url = reverse('inventory-adjust')
    payload = {
        'outletId': str(strip_batch.outlet.id),
        'batchId': str(strip_batch.id),
        'adjustType': 'sub',
        'adjustUnit': 'strips',
        'qty': '-200', # More than available (100)
        'reason': 'Damaged'
    }
    response = api_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == 100

@pytest.mark.django_db
def test_unit_integrity_enforcement(api_client, box_batch):
    # Ensure non-strip products CANNOT be deducted using qty_loose.
    customer = CustomerFactory(outlet=box_batch.outlet)
    url = reverse('sale-list-create')
    payload = {
        'outletId': str(box_batch.outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '250.00',
        'subtotal': '250.00',
        'discountAmount': '0',
        'paymentMode': 'cash',
        'cashPaid': '250.00',
        'invoiceDate': '2026-08-01',
        'items': [
            {
                'productId': str(box_batch.product.id),
                'batchId': str(box_batch.id),
                'qtyStrips': 0,
                'qtyLoose': 1,
                'saleRate': '250.00',
                'mrp': '250.00'
            }
        ]
    }
    response = api_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.django_db
def test_atomicity_on_failure(api_client, strip_batch):
    customer = CustomerFactory(outlet=strip_batch.outlet)
    url = reverse('sale-list-create')
    payload = {
        'outletId': str(strip_batch.outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '50.00',
        'subtotal': '50.00',
        'discountAmount': '0',
        'paymentMode': 'cash',
        'cashPaid': '50.00',
        'invoiceDate': '2026-08-01',
        'items': [
            {
                'productId': str(strip_batch.product.id),
                'batchId': str(strip_batch.id),
                'qtyStrips': 1,
                'qtyLoose': 0,
                'saleRate': '50.00',
                'mrp': '50.00'
            }
        ]
    }
    
    initial_stock = strip_batch.qty_strips
    initial_ledger_count = StockLedger.objects.count()
    initial_invoices = SaleInvoice.objects.count()

    # Induce an error during SaleItem creation
    with patch('apps.billing.views.SaleItem.objects.create', side_effect=Exception("DB Error")):
        try:
            api_client.post(url, payload, format='json')
        except Exception:
            pass

    strip_batch.refresh_from_db()
    
    assert strip_batch.qty_strips == initial_stock
    assert StockLedger.objects.count() == initial_ledger_count
    assert SaleInvoice.objects.count() == initial_invoices

@pytest.mark.django_db(transaction=True)
def test_concurrency_stock_deduction(strip_batch):
    customer = CustomerFactory(outlet=strip_batch.outlet)
    url = reverse('sale-list-create')
    payload = {
        'outletId': str(strip_batch.outlet.id),
        'customerId': str(customer.id),
        'grandTotal': '3000.00',
        'subtotal': '3000.00',
        'discountAmount': '0',
        'paymentMode': 'cash',
        'cashPaid': '3000.00',
        'invoiceDate': '2026-08-01',
        'items': [
            {
                'productId': str(strip_batch.product.id),
                'batchId': str(strip_batch.id),
                'qtyStrips': 60,
                'qtyLoose': 0,
                'saleRate': '50.00',
                'mrp': '50.00'
            }
        ]
    }

    def make_request():
        from apps.accounts.tests.factories import StaffFactory
        staff = StaffFactory(outlet=strip_batch.outlet, role="admin")
        client = APIClient()
        client.force_authenticate(user=staff)
        return client.post(url, payload, format='json')

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(make_request) for _ in range(2)]
        results = [f.result() for f in futures]
    
    statuses = [r.status_code for r in results]
    
    assert 201 in statuses
    assert 400 in statuses
    
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == 40
