import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.prod")
django.setup()
from django.conf import settings
settings.CELERY_TASK_ALWAYS_EAGER = True

from apps.core.models import Outlet
from apps.accounts.models import Customer, Doctor, Staff, Ledger, LedgerGroup
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch
from apps.audit.models import DocumentRevision
from decimal import Decimal
from django.contrib.contenttypes.models import ContentType
from datetime import date
from django.db import transaction

@transaction.atomic
def run_test():
    outlet = Outlet.objects.first()
    user = Staff.objects.first()
    
    # 1. Create a Distributor
    distributor = Distributor.objects.create(
        outlet=outlet,
        name="Test Distributor",
        phone="1234567890",
        address="123 Test St",
        city="Test City",
        state="Test State"
    )
    
    # 2. Create Ledger for Distributor
    group = LedgerGroup.objects.filter(name='Sundry Creditors', outlet=outlet).first()
    ledger = Ledger.objects.create(
        outlet=outlet,
        name="Test Distributor Ledger",
        group=group,
        linked_distributor=distributor
    )
    
    # 3. Create a MasterProduct
    product = MasterProduct.objects.create(
        outlet=outlet,
        name="Test Medicine",
        mrp=Decimal('100.00'),
        purchase_rate=Decimal('50.00'),
        sale_rate=Decimal('80.00'),
        pack_size=10
    )
    
    # 4. Create a PurchaseInvoice directly
    from apps.purchases.services import atomic_purchase_save
    payload = {
        'outletId': str(outlet.id),
        'partyLedgerId': str(ledger.id),
        'invoiceNo': 'TEST-PUR-01',
        'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
        'dueDate': date.today().isoformat() + 'T00:00:00Z',
        'purchaseType': 'credit',
        'subtotal': 1000.00,
        'discountAmount': 0.00,
        'taxableAmount': 1000.00,
        'gstAmount': 0.00,
        'cessAmount': 0.00,
        'grandTotal': 1000.00,
        'items': [
            {
                'masterProductId': str(product.id),
                'batchNo': 'BATCH-001',
                'expiryDate': '12/26',
                'qty': 20,
                'actualQty': 20,
                'purchaseRate': 50.00,
                'mrp': 100.00,
                'saleRate': 80.00,
                'taxableAmount': 1000.00,
                'gstAmount': 0.00,
                'totalAmount': 1000.00,
                'ptr': 50.00,
                'pts': 45.00,
            }
        ]
    }
    
    invoice = atomic_purchase_save(payload, str(outlet.id), str(user.id))
    print(f"Created invoice: {invoice.id}")
    
    # 5. Now update it
    from apps.purchases.views import PurchaseDetailView
    from rest_framework.test import APIRequestFactory, force_authenticate
    
    factory = APIRequestFactory()
    request = factory.put(f'/api/v1/purchases/{invoice.id}/', {
        **payload,
        'revisionReasonCode': 'QTY_CHANGE',
        'revisionReasonText': 'Changed quantity from 20 to 30',
        'subtotal': 1500.00,
        'taxableAmount': 1500.00,
        'grandTotal': 1500.00,
        'items': [
            {
                'masterProductId': str(product.id),
                'batchNo': 'BATCH-001',
                'expiryDate': '12/26',
                'qty': 30, # Increased
                'actualQty': 30,
                'purchaseRate': 50.00,
                'mrp': 100.00,
                'saleRate': 80.00,
                'taxableAmount': 1500.00,
                'gstAmount': 0.00,
                'totalAmount': 1500.00,
                'ptr': 50.00,
                'pts': 45.00,
            }
        ]
    }, format='json')
    force_authenticate(request, user=user.user)
    
    view = PurchaseDetailView.as_view()
    response = view(request, purchase_id=invoice.id)
    print(f"Update response: {response.status_code}, {response.data}")
    
    # 6. Verify Revision
    ct = ContentType.objects.get_for_model(PurchaseInvoice)
    revisions = DocumentRevision.objects.filter(content_type=ct, object_id=str(invoice.id))
    print(f"Found {revisions.count()} revisions")
    for r in revisions:
        print(f"Revision: {r.id}, Reason: {r.reason_code}")
        
    transaction.set_rollback(True)

run_test()
