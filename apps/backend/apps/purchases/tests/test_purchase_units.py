from django.test import TestCase
from decimal import Decimal
from datetime import date
from django.core.exceptions import ValidationError

from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Ledger, LedgerGroup
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch
from apps.purchases.services import atomic_purchase_save, PurchaseServiceError

class PurchaseUnitsTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        self.user = Staff.objects.create(
            name="testuser",
            phone="9999999999",
            outlet=self.outlet,
            role="admin"
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
        self.ledger = Ledger.objects.create(
            outlet=self.outlet,
            name="Test Distributor Ledger",
            group=self.group,
            linked_distributor=self.distributor
        )
        self.product = MasterProduct.objects.create(
            name="Test Medicine",
            mrp=Decimal('100.00'),
            pack_size=10
        )
        
        self.purchase_ledger = Ledger.objects.create(outlet=self.outlet, name="Purchase Account", group=self.group)
        self.cgst_ledger = Ledger.objects.create(outlet=self.outlet, name="GST Input (CGST)", group=self.group)
        self.sgst_ledger = Ledger.objects.create(outlet=self.outlet, name="GST Input (SGST)", group=self.group)

    def _get_base_payload(self, qty=10, qty_loose=0):
        return {
            'outletId': str(self.outlet.id),
            'partyLedgerId': str(self.ledger.id),
            'invoiceNo': 'TEST-PUR-UNIT',
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
                    'batchNo': 'BATCH-UNIT',
                    'expiryDate': '2026-12-01T00:00:00Z',
                    'qty': qty,
                    'qtyLoose': qty_loose,
                    'actualQty': qty * self.product.pack_size + qty_loose,
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

    def test_full_pack_purchase_success(self):
        payload = self._get_base_payload(qty=10, qty_loose=0)
        invoice = atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        self.assertEqual(invoice.invoice_no, 'TEST-PUR-UNIT')
        self.assertEqual(invoice.items.count(), 1)
        item = invoice.items.first()
        self.assertEqual(item.qty, 10)

    def test_loose_stock_purchase_fails(self):
        payload = self._get_base_payload(qty=10, qty_loose=5)
        with self.assertRaises(PurchaseServiceError) as cm:
            atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        
        self.assertIn("Inbound stock must be full units (packs/strips), loose quantities are not supported.", str(cm.exception))
