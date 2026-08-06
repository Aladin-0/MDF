import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
from apps.billing.sale_services import atomic_sale_save
from apps.inventory.models import StockLedger, Batch
from apps.accounts.tests.factories import StaffFactory

@pytest.mark.django_db
def test_opening_stock_ledger(strip_batch):
    """
    1. Verify that the opening balance of `strip_batch` exactly matches 
    its initial `StockLedger` entry created by the fixture.
    """
    # The fixture strip_batch creates an OPENING stock ledger entry.
    ledger = StockLedger.objects.get(batch=strip_batch, txn_type='OPENING')
    assert ledger.running_qty == Decimal('100.0')
    assert ledger.qty_in == Decimal('100.0')
    assert ledger.qty_out == Decimal('0.0')
    assert strip_batch.qty_strips == 100

@pytest.mark.django_db
def test_ledger_parity_after_sale(inventory_outlet, strip_product, strip_batch):
    """
    2. Execute a sale, then assert the ledger-derived running balance exactly matches current stock.
    """
    staff = StaffFactory(outlet=inventory_outlet)
    
    request_data = {
        'grandTotal': 100.00,
        'subtotal': 100.00,
        'discountAmount': 0,
        'cashPaid': 100.00,
        'paymentMode': 'cash',
        'invoiceDate': timezone.now().isoformat(),
    }
    
    items_data = [{
        'productId': str(strip_product.id),
        'batchId': str(strip_batch.id),
        'qtyStrips': 2,
        'qtyLoose': 0,
        'rate': '50.00',
        'gstRate': '0',
    }]
    
    atomic_sale_save(
        request_data=request_data,
        outlet=inventory_outlet,
        customer=None,
        billed_by=staff,
        items_data=items_data,
        schedule_h_data=None,
        hospital_name='',
        doctor_id=None
    )
    
    strip_batch.refresh_from_db()
    assert strip_batch.qty_strips == 98
    
    latest_ledger = StockLedger.objects.filter(batch=strip_batch).order_by('-created_at').first()
    assert latest_ledger.running_qty == Decimal('98.0')
    assert latest_ledger.txn_type == 'SALE_OUT'
    assert latest_ledger.qty_out == Decimal('2.0')

@pytest.mark.django_db
def test_ledger_parity_after_adjustment(client, inventory_outlet, box_batch):
    """
    3. Execute a manual adjustment (via InventoryAdjustView), then verify the ledger parity invariant.
    """
    staff = StaffFactory(outlet=inventory_outlet, staff_pin='1234')
    
    # We must authenticate since IsManagerOrAbove is required
    from rest_framework.test import APIClient
    api_client = APIClient()
    api_client.force_authenticate(user=staff)
    
    response = api_client.post(f'/api/v1/inventory/adjust/?outletId={inventory_outlet.id}', {
        'batchId': str(box_batch.id),
        'type': 'damage',
        'qty': -5,
        'reason': 'Water damage',
        'pin': '1234'
    }, format='json')
    
    assert response.status_code == 200, response.data
    
    box_batch.refresh_from_db()
    assert box_batch.qty_strips == 45
    
    latest_ledger = StockLedger.objects.filter(batch=box_batch).order_by('-created_at').first()
    assert latest_ledger.running_qty == Decimal('45.0')
    assert latest_ledger.txn_type == 'ADJUSTMENT_OUT'
    assert latest_ledger.qty_out == Decimal('5.0')

@pytest.mark.django_db
def test_auditability_fields(client, inventory_outlet, box_batch):
    """
    4. Verify that manual adjustments correctly log the reason, actor (user), and timestamp in the StockLedger.
    """
    staff = StaffFactory(outlet=inventory_outlet, staff_pin='1234')
    
    from rest_framework.test import APIClient
    api_client = APIClient()
    api_client.force_authenticate(user=staff)
    
    response = api_client.post(f'/api/v1/inventory/adjust/?outletId={inventory_outlet.id}', {
        'batchId': str(box_batch.id),
        'type': 'damage',
        'qty': -1,
        'reason': 'Sample check',
        'pin': '1234'
    }, format='json')
    
    assert response.status_code == 200
    
    latest_ledger = StockLedger.objects.filter(batch=box_batch).order_by('-created_at').first()
    # Reason is often stored in party_name or a dedicated reason field
    # The prompt explicitly asks to check reason, actor, and timestamp.
    assert 'Sample check' in latest_ledger.party_name
    assert latest_ledger.created_at is not None
    
    assert latest_ledger.actor == staff
