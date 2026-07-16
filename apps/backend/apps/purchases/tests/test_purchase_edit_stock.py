from django.test import TestCase
from decimal import Decimal
from datetime import date

from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Ledger, LedgerGroup
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch
from apps.inventory.services import post_stock_ledger_entry, rebuild_stock_ledger
from apps.purchases.services import atomic_purchase_save, atomic_purchase_update
from apps.purchases.services import PurchaseServiceError

class PurchaseEditStockTest(TestCase):
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
            pack_size=1
        )
        self.product2 = MasterProduct.objects.create(
            name="Test Medicine 2",
            mrp=Decimal('200.00'),
            default_sale_rate=Decimal('160.00'),
            pack_size=1
        )

    def _create_purchase(self, qty=10, batch_no="BATCH-001"):
        payload = {
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': f'TEST-PUR-{batch_no}',
            'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': float(qty * 50),
            'discountAmount': 0.00,
            'taxableAmount': float(qty * 50),
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': float(qty * 50),
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': batch_no,
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': qty,
                    'actualQty': qty,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': float(qty * 50),
                    'gstAmount': 0.00,
                    'totalAmount': float(qty * 50),
                    'ptr': 50.00,
                    'pts': 45.00,
                }
            ]
        }
        return atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))

    def _create_sale(self, batch, qty=4):
        post_stock_ledger_entry(
            outlet=self.outlet,
            product=self.product,
            batch=batch,
            txn_type='SALE_OUT',
            txn_date=date.today(),
            voucher_type='Sale Invoice',
            voucher_number='TEST-SALE-01',
            party_name='Test Customer',
            qty_in=0,
            qty_out=qty,
            rate=Decimal('80.00'),
            source_object=None
        )
        rebuild_stock_ledger(batch.pk, date.today())
        batch.refresh_from_db()
        return batch

    def test_purchase_edit_10_to_20_with_4_sold(self):
        invoice = self._create_purchase(10)
        batch = Batch.objects.get(batch_no="BATCH-001")
        self.assertEqual(batch.qty_strips, 10)

        self._create_sale(batch, 4)
        self.assertEqual(batch.qty_strips, 6)

        payload = {
            'revisionReasonCode': 'CORRECTION',
            'revisionReasonText': 'valid reason text',
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat() + 'T00:00:00Z',
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
                    'batchNo': "BATCH-001",
                    'expiryDate': '2026-12-01T00:00:00Z',
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
        atomic_purchase_update(invoice.id, payload, str(self.outlet.id), str(self.user.id))
        batch.refresh_from_db()
        self.assertEqual(batch.qty_strips, 16) 

    def test_purchase_edit_10_to_12_with_4_sold(self):
        invoice = self._create_purchase(10, "BATCH-002")
        batch = Batch.objects.get(batch_no="BATCH-002")
        self._create_sale(batch, 4)
        
        payload = {
            'revisionReasonCode': 'CORRECTION',
            'revisionReasonText': 'valid reason text',
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': 600.00,
            'discountAmount': 0.00,
            'taxableAmount': 600.00,
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': 600.00,
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "BATCH-002",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 12,
                    'actualQty': 12,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 600.00,
                    'gstAmount': 0.00,
                    'totalAmount': 600.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                }
            ]
        }
        atomic_purchase_update(invoice.id, payload, str(self.outlet.id), str(self.user.id))
        batch.refresh_from_db()
        self.assertEqual(batch.qty_strips, 8)

    def test_purchase_edit_10_to_10_noop_with_4_sold(self):
        invoice = self._create_purchase(10, "BATCH-003")
        batch = Batch.objects.get(batch_no="BATCH-003")
        self._create_sale(batch, 4)
        
        payload = {
            'revisionReasonCode': 'CORRECTION',
            'revisionReasonText': 'valid reason text',
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': 500.00,
            'discountAmount': 0.00,
            'taxableAmount': 500.00,
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': 500.00,
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "BATCH-003",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 10,
                    'actualQty': 10,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 500.00,
                    'gstAmount': 0.00,
                    'totalAmount': 500.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                }
            ]
        }
        atomic_purchase_update(invoice.id, payload, str(self.outlet.id), str(self.user.id))
        batch.refresh_from_db()
        self.assertEqual(batch.qty_strips, 6)

    def test_purchase_edit_10_to_6_with_4_sold(self):
        invoice = self._create_purchase(10, "BATCH-004")
        batch = Batch.objects.get(batch_no="BATCH-004")
        self._create_sale(batch, 4)
        
        payload = {
            'revisionReasonCode': 'CORRECTION',
            'revisionReasonText': 'valid reason text',
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': 300.00,
            'discountAmount': 0.00,
            'taxableAmount': 300.00,
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': 300.00,
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "BATCH-004",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 6,
                    'actualQty': 6,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 300.00,
                    'gstAmount': 0.00,
                    'totalAmount': 300.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                }
            ]
        }
        atomic_purchase_update(invoice.id, payload, str(self.outlet.id), str(self.user.id))
        batch.refresh_from_db()
        self.assertEqual(batch.qty_strips, 2)

    def test_purchase_edit_10_to_3_with_4_sold_fails(self):
        invoice = self._create_purchase(10, "BATCH-005")
        batch = Batch.objects.get(batch_no="BATCH-005")
        self._create_sale(batch, 4)
        
        payload = {
            'revisionReasonCode': 'CORRECTION',
            'revisionReasonText': 'valid reason text',
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': invoice.invoice_no,
            'invoiceDate': invoice.invoice_date.isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': 150.00,
            'discountAmount': 0.00,
            'taxableAmount': 150.00,
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': 150.00,
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "BATCH-005",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 3,
                    'actualQty': 3,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 150.00,
                    'gstAmount': 0.00,
                    'totalAmount': 150.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                }
            ]
        }
        with self.assertRaises(Exception) as context:
            atomic_purchase_update(invoice.id, payload, str(self.outlet.id), str(self.user.id))
        self.assertTrue('consumed' in str(context.exception).lower() or 'negative' in str(context.exception).lower())

    def test_multiple_items_and_batches(self):
        payload = {
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': 'TEST-PUR-MULTI',
            'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': 1500.00,
            'discountAmount': 0.00,
            'taxableAmount': 1500.00,
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': 1500.00,
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "B1",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 10,
                    'actualQty': 10,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 500.00,
                    'gstAmount': 0.00,
                    'totalAmount': 500.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                },
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "B2",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 10,
                    'actualQty': 10,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 500.00,
                    'gstAmount': 0.00,
                    'totalAmount': 500.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                },
                {
                    'masterProductId': str(self.product2.id),
                    'batchNo': "B3",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 5,
                    'actualQty': 5,
                    'purchaseRate': 100.00,
                    'mrp': 200.00,
                    'saleRate': 160.00,
                    'taxableAmount': 500.00,
                    'gstAmount': 0.00,
                    'totalAmount': 500.00,
                    'ptr': 100.00,
                    'pts': 90.00,
                }
            ]
        }
        invoice = atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        
        batch1 = Batch.objects.get(batch_no="B1")
        batch2 = Batch.objects.get(batch_no="B2")
        batch3 = Batch.objects.get(batch_no="B3")
        
        # Sell 4 from B1
        self._create_sale(batch1, 4)
        
        update_payload = {
            'revisionReasonCode': 'CORRECTION',
            'revisionReasonText': 'valid reason text',
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': 'TEST-PUR-MULTI',
            'invoiceDate': date.today().isoformat() + 'T00:00:00Z',
            'purchaseType': 'credit',
            'subtotal': 1800.00,
            'discountAmount': 0.00,
            'taxableAmount': 1800.00,
            'gstAmount': 0.00,
            'cessAmount': 0.00,
            'grandTotal': 1800.00,
            'items': [
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "B1",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 12,
                    'actualQty': 12,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 600.00,
                    'gstAmount': 0.00,
                    'totalAmount': 600.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                },
                {
                    'masterProductId': str(self.product.id),
                    'batchNo': "B2",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 8,
                    'actualQty': 8,
                    'purchaseRate': 50.00,
                    'mrp': 100.00,
                    'saleRate': 80.00,
                    'taxableAmount': 400.00,
                    'gstAmount': 0.00,
                    'totalAmount': 400.00,
                    'ptr': 50.00,
                    'pts': 45.00,
                },
                {
                    'masterProductId': str(self.product2.id),
                    'batchNo': "B3",
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': 8,
                    'actualQty': 8,
                    'purchaseRate': 100.00,
                    'mrp': 200.00,
                    'saleRate': 160.00,
                    'taxableAmount': 800.00,
                    'gstAmount': 0.00,
                    'totalAmount': 800.00,
                    'ptr': 100.00,
                    'pts': 90.00,
                }
            ]
        }
        atomic_purchase_update(invoice.id, update_payload, str(self.outlet.id), str(self.user.id))
        
        batch1.refresh_from_db()
        batch2.refresh_from_db()
        batch3.refresh_from_db()
        
        self.assertEqual(batch1.qty_strips, 8)  # 12 - 4
        self.assertEqual(batch2.qty_strips, 8)
        self.assertEqual(batch3.qty_strips, 8)
