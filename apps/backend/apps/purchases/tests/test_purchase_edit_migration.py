from django.test import TestCase
from decimal import Decimal
from datetime import date
from django.db import transaction
from unittest.mock import patch

from apps.core.models import Outlet, Organization
from apps.accounts.models import Customer, Doctor, Staff, Ledger, LedgerGroup, JournalEntry, JournalLine
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch
from apps.audit.models import DocumentRevisionV2
from apps.purchases.services import atomic_purchase_save, atomic_purchase_update, PurchaseServiceError
from django.contrib.contenttypes.models import ContentType

class PurchaseEditMigrationTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        self.user = Staff.objects.create(
            name="testuser",
            phone="9999999999",
            outlet=self.outlet,
            role="admin",
            can_modify_paid_purchases=True
        )

        self.distributor = Distributor.objects.create(
            outlet=self.outlet,
            name="Test Distributor",
            phone="1234567890",
            address="123 Test St",
            city="Test City",
            state="Test State"
        )

        self.group = LedgerGroup.objects.create(
            name='Sundry Creditors',
            outlet=self.outlet,
            nature='liability'
        )
        
        self.purchase_ledger = Ledger.objects.create(outlet=self.outlet, name="Purchase Account", group=self.group)
        self.cgst_ledger = Ledger.objects.create(outlet=self.outlet, name="GST Input (CGST)", group=self.group)
        self.sgst_ledger = Ledger.objects.create(outlet=self.outlet, name="GST Input (SGST)", group=self.group)


        self.ledger = Ledger.objects.create(
            outlet=self.outlet,
            name="Test Distributor Ledger",
            group=self.group,
            linked_distributor=self.distributor
        )

        self.product = MasterProduct.objects.create(
            name="Test Medicine",
            mrp=Decimal('100.00'),
            default_sale_rate=Decimal('80.00'),
            pack_size=10
        )
        
        self.base_payload = {
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
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
                    'masterProductId': str(self.product.id),
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
        self.invoice = atomic_purchase_save(self.base_payload, str(self.outlet.id), str(self.user.id))

    def test_purchase_edit_happy_path(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'CORRECTION'
        update_payload['revisionReasonText'] = 'Test reason is valid'
        update_payload['subtotal'] = 1200.00
        update_payload['taxableAmount'] = 1200.00
        update_payload['grandTotal'] = 1200.00
        update_payload['items'][0]['qty'] = 24
        update_payload['items'][0]['actualQty'] = 24
        update_payload['items'][0]['taxableAmount'] = 1200.00
        update_payload['items'][0]['totalAmount'] = 1200.00

        updated_invoice = atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        self.assertEqual(updated_invoice.grand_total, Decimal('1200.00'))
        
        # Verify DocumentRevisionV2
        ct = ContentType.objects.get_for_model(PurchaseInvoice)
        revisions = DocumentRevisionV2.objects.filter(content_type=ct, object_id=updated_invoice.id)
        self.assertEqual(revisions.count(), 2)
        self.assertEqual(revisions.first().reason_code, 'CORRECTION')

    def test_purchase_edit_amount_tax_update(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'TAX_UPDATE'
        update_payload['revisionReasonText'] = 'Tax update is here'
        update_payload['gstAmount'] = 100.00
        update_payload['grandTotal'] = 1100.00
        update_payload['items'][0]['gstAmount'] = 100.00
        update_payload['items'][0]['totalAmount'] = 1100.00

        updated_invoice = atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        self.assertEqual(updated_invoice.gst_amount, Decimal('100.00'))
        self.assertEqual(updated_invoice.grand_total, Decimal('1100.00'))

    def test_purchase_edit_line_item_update(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'LINE_ITEM_UPDATE'
        update_payload['revisionReasonText'] = 'Changing qty and batch'
        update_payload['subtotal'] = 1500.00
        update_payload['taxableAmount'] = 1500.00
        update_payload['grandTotal'] = 1500.00
        update_payload['items'][0]['qty'] = 30
        update_payload['items'][0]['actualQty'] = 30
        update_payload['items'][0]['taxableAmount'] = 1500.00
        update_payload['items'][0]['totalAmount'] = 1500.00

        updated_invoice = atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        # Check that the batch quantity updated
        batch = Batch.objects.get(batch_no='BATCH-001', outlet=self.outlet)
        self.assertEqual(batch.qty_strips, 30)

    def test_purchase_edit_supplier_outstanding_recalculation(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'PRICE_UPDATE'
        update_payload['revisionReasonText'] = 'Price went up to 60'
        update_payload['subtotal'] = 1200.00
        update_payload['taxableAmount'] = 1200.00
        update_payload['grandTotal'] = 1200.00
        update_payload['items'][0]['purchaseRate'] = 60.00
        update_payload['items'][0]['taxableAmount'] = 1200.00
        update_payload['items'][0]['totalAmount'] = 1200.00

        atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        # Check supplier ledger balance
        self.ledger.refresh_from_db()
        self.assertEqual(self.ledger.current_balance, Decimal('1200.00'))

    def test_purchase_edit_inventory_valuation_consistency(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'RATE_UPDATE'
        update_payload['revisionReasonText'] = 'Updating rates properly'
        update_payload['items'][0]['purchaseRate'] = 55.00
        update_payload['items'][0]['saleRate'] = 85.00
        update_payload['items'][0]['mrp'] = 110.00
        
        atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        batch = Batch.objects.get(batch_no='BATCH-001', outlet=self.outlet)
        self.assertEqual(batch.purchase_rate, Decimal('55.00'))
        self.assertEqual(batch.sale_rate, Decimal('85.00'))
        self.assertEqual(batch.mrp, Decimal('110.00'))

    def test_purchase_edit_missing_audit_reason_validation(self):
        update_payload = dict(self.base_payload)
        
        with self.assertRaises(Exception):
            atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))

    def test_purchase_edit_atomic_rollback_on_business_failure(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'FAIL_BIZ'
        update_payload['revisionReasonText'] = 'Will fail in business logic'
        
        with patch('apps.purchases.services.post_purchase_invoice', side_effect=ValueError("Simulated biz failure")):
            with self.assertRaises(Exception):
                atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.grand_total, Decimal('1000.00'))

    def test_purchase_edit_atomic_rollback_on_audit_failure(self):
        update_payload = dict(self.base_payload)
        update_payload['revisionReasonCode'] = 'FAIL_AUDIT'
        update_payload['revisionReasonText'] = 'Will fail in audit logic'
        update_payload['grandTotal'] = 2000.00
        
        with patch('apps.audit.core.orchestrator.record_mutation', side_effect=Exception("Simulated audit failure")):
            with self.assertRaises(Exception):
                atomic_purchase_update(str(self.invoice.id), update_payload, str(self.outlet.id), str(self.user.id))
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.grand_total, Decimal('1000.00'))
