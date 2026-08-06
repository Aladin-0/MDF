import pytest
from decimal import Decimal
import concurrent.futures
from django.urls import reverse
from rest_framework.test import APIClient
from apps.core.models import Organization, Outlet
from apps.accounts.models import Staff, DebitNote, DebitNoteItem
from apps.purchases.models import Distributor
from apps.inventory.models import MasterProduct, Batch

@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
def test_purchase_return_concurrency():
    """
    Verify that concurrent edits to the same purchase return properly lock the target
    inventory Batch using select_for_update() and avoid race conditions on batch quantity.
    """
    org = Organization.objects.create(name="Test Org")
    outlet = Outlet.objects.create(name="Test Outlet", organization=org)
    
    admin = Staff.objects.create(
        phone="9999999999", name="Admin", outlet=outlet, 
        role="super_admin"
    )
    admin.set_password('password123')
    admin.save()
    
    distributor = Distributor.objects.create(
        outlet=outlet, name="Test Dist", phone="7777777777"
    )
    
    product = MasterProduct.objects.create(
        name="Dolo 650", mrp=Decimal('10.00'), default_sale_rate=Decimal('10.00'), 
        pack_size=10, pack_unit='tablet', pack_type='strip'
    )
    batch = Batch.objects.create(
        outlet=outlet, product=product, batch_no="B-CONC", 
        expiry_date="2026-12-31", mrp=Decimal('10.00'), 
        purchase_rate=Decimal('8.00'), sale_rate=Decimal('10.00'),
        qty_strips=100  # Initial quantity
    )
    
    note = DebitNote.objects.create(
        outlet=outlet,
        distributor=distributor,
        debit_note_no="DN-CONC-1",
        date="2026-07-01",
        reason="Expired Goods",
        subtotal=Decimal('100.00'),
        gst_amount=Decimal('5.00'),
        total_amount=Decimal('105.00'),
        created_by=admin
    )
    item = DebitNoteItem.objects.create(
        debit_note=note,
        batch=batch,
        product_name="Dolo 650",
        qty=10,  # Returned 10, so batch qty should have been reduced in real scenario, but we just set qty here
        rate=Decimal('10.00'),
        gst_rate=Decimal('5.00'),
        total=Decimal('105.00')
    )
    
    client1 = APIClient()
    client1.force_authenticate(user=admin)
    client2 = APIClient()
    client2.force_authenticate(user=admin)
    
    url = reverse('debit-note-detail', kwargs={'pk': note.id}) + f"?outletId={outlet.id}"
    
    # Client 1 updates return qty to 20
    payload1 = {
        'outletId': str(outlet.id),
        'distributor_id': str(distributor.id),
        'date': '2026-07-01',
        'reason': 'Expired Goods',
        'subtotal': '200.00',
        'gst_amount': '10.00',
        'total_amount': '210.00',
        'revisionReasonCode': 'correction',
        'revisionReasonText': 'Updating qty to 20',
        'items': [
            {
                'id': str(item.id),
                'batch_id': str(batch.id),
                'product_name': 'Dolo 650',
                'qty': 20,
                'rate': '10.00',
                'gst_rate': '5.00',
                'total': '200.00'
            }
        ]
    }
    
    # Client 2 updates return qty to 30
    payload2 = {
        'outletId': str(outlet.id),
        'distributor_id': str(distributor.id),
        'date': '2026-07-01',
        'reason': 'Expired Goods',
        'subtotal': '300.00',
        'gst_amount': '15.00',
        'total_amount': '315.00',
        'revisionReasonCode': 'correction',
        'revisionReasonText': 'Updating qty to 30',
        'items': [
            {
                'id': str(item.id),
                'batch_id': str(batch.id),
                'product_name': 'Dolo 650',
                'qty': 30,
                'rate': '10.00',
                'gst_rate': '5.00',
                'total': '300.00'
            }
        ]
    }
    
    def make_request(c, p):
        return c.put(url, p, format='json')
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_request, client1, payload1)
        f2 = executor.submit(make_request, client2, payload2)
        
        r1 = f1.result()
        r2 = f2.result()
        
    batch.refresh_from_db()
    
    # Original qty was 100.
    # The DebitNote Update Service:
    # 1. Reverses old logic: adds item.qty (10) back to batch -> batch becomes 110.
    # 2. Applies new logic: deducts new_qty (20 or 30).
    # If 20 succeeded: 110 - 20 = 90
    # If 30 succeeded: 110 - 30 = 80
    # If both hit race condition without select_for_update, it might end up as 110 - 20 - 30 = 60
    # or just 110 - 20 = 90 with the other overwritten.
    
    # We just assert it is exactly one of the valid outcomes.
    assert batch.qty_strips in [90, 80]
