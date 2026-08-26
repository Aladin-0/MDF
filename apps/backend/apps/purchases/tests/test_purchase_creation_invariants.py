from django.test import TestCase
from decimal import Decimal
from datetime import date
from django.db import transaction, IntegrityError
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Ledger, LedgerGroup, JournalEntry, JournalLine
from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.purchases.services import atomic_purchase_save

class PurchaseCreationInvariantsTest(TestCase):

    def setUp(self):
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(name='Test Outlet', organization=self.org)
        self.user = Staff.objects.create(name='testuser', phone='9999999999', outlet=self.outlet, role='admin')
        self.distributor = Distributor.objects.create(outlet=self.outlet, name='Test Distributor', credit_days=15)
        self.sundry_creditors = LedgerGroup.objects.create(name='Sundry Creditors', outlet=self.outlet, nature='liability')
        self.purchase_accounts = LedgerGroup.objects.create(name='Purchase Accounts', outlet=self.outlet, nature='expense')
        self.duties_taxes = LedgerGroup.objects.create(name='Duties & Taxes', outlet=self.outlet, nature='liability')
        self.cash_group = LedgerGroup.objects.create(name='Cash in Hand', outlet=self.outlet, nature='asset')
        self.direct_expenses = LedgerGroup.objects.create(name='Direct Expenses', outlet=self.outlet, nature='expense')
        self.ledger = Ledger.objects.create(outlet=self.outlet, name='Test Distributor', group=self.sundry_creditors, linked_distributor=self.distributor)
        self.purchase_ledger = Ledger.objects.create(outlet=self.outlet, name='Purchase Account', group=self.purchase_accounts)
        self.cgst_ledger = Ledger.objects.create(outlet=self.outlet, name='GST Input (CGST)', group=self.duties_taxes)
        self.sgst_ledger = Ledger.objects.create(outlet=self.outlet, name='GST Input (SGST)', group=self.duties_taxes)
        self.cess_ledger = Ledger.objects.create(outlet=self.outlet, name='Cess Account', group=self.duties_taxes)
        self.freight_ledger = Ledger.objects.create(outlet=self.outlet, name='Freight Inward', group=self.direct_expenses)
        self.discount_ledger = Ledger.objects.create(outlet=self.outlet, name='Discount Received', group=self.purchase_accounts)
        self.cash_ledger = Ledger.objects.create(outlet=self.outlet, name='Cash', group=self.cash_group)
        self.product = MasterProduct.objects.create(name='Test Medicine', mrp=Decimal('100.00'), pack_size=10, pack_unit='tablet', pack_type='strip')

    def _create_payload(self, purchase_type='credit', fail_deliberately=False):
        return {'outletId': str(self.outlet.id), 'partyLedgerId': str(self.ledger.id), 'invoiceNo': 'TEST-INV-001', 'invoiceDate': date.today().isoformat() + 'T00:00:00Z', 'purchaseType': purchase_type, 'subtotal': 1000.0, 'discountAmount': 100.0, 'taxableAmount': 900.0, 'gstAmount': 108.0, 'cessAmount': 20.0, 'freight': 50.0, 'grandTotal': 1078.0, 'items': [{'masterProductId': str(self.product.id), 'batchNo': 'BATCH-TEST', 'expiryDate': '2026-12-01T00:00:00Z', 'qty': 10, 'actualQty': 100, 'purchaseRate': 100.0, 'mrp': 150.0, 'saleRate': 120.0, 'discountPct': 10.0, 'taxableAmount': 900.0, 'gstRate': 12.0, 'gstAmount': 108.0, 'cess': 2.0, 'cessAmount': 20.0, 'totalAmount': 1028.0, 'ptr': 100.0, 'pts': 90.0} if not fail_deliberately else {'masterProductId': str(self.product.id), 'batchNo': 'X' * 101, 'expiryDate': '2026-12-01T00:00:00Z', 'qty': 10, 'actualQty': 100, 'purchaseRate': 100.0, 'mrp': 150.0, 'saleRate': 120.0, 'taxableAmount': 900.0, 'gstAmount': 108.0, 'totalAmount': 1028.0, 'ptr': 100.0, 'pts': 90.0}]}

    def test_landing_price_computation(self):
        payload = self._create_payload()
        invoice = atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        item = invoice.items.first()
        expected_landing_rate = (item.purchase_rate - item.purchase_rate * (item.discount_pct / Decimal('100')) + item.freight_per_unit + item.cess).quantize(Decimal('0.0001'))
        self.assertEqual(item.landing_rate.quantize(Decimal('0.0001')), expected_landing_rate)

    def test_freight_cess_discounts_ledgers(self):
        payload = self._create_payload()
        invoice = atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        je = JournalEntry.objects.filter(source_type='PURCHASE', source_id=invoice.id).first()
        self.assertIsNotNone(je)
        lines = je.lines.all()
        freight_line = lines.filter(ledger=self.freight_ledger).first()
        if invoice.freight > 0:
            self.assertIsNotNone(freight_line)
            self.assertEqual(freight_line.debit_amount, invoice.freight)
        cess_line = lines.filter(ledger=self.cess_ledger).first()
        if invoice.cess_amount > 0:
            self.assertIsNotNone(cess_line)
            self.assertEqual(cess_line.debit_amount, invoice.cess_amount)
        discount_line = lines.filter(ledger=self.discount_ledger).first()
        if invoice.discount_amount > 0:
            self.assertIsNotNone(discount_line)
            self.assertEqual(discount_line.credit_amount, invoice.discount_amount)

    def test_cash_vs_credit(self):
        payload_credit = self._create_payload(purchase_type='credit')
        payload_credit['invoiceNo'] = 'TEST-INV-CREDIT'
        invoice_credit = atomic_purchase_save(payload_credit, str(self.outlet.id), str(self.user.id))
        je_credit = JournalEntry.objects.filter(source_type='PURCHASE', source_id=invoice_credit.id).first()
        supplier_credit_line = je_credit.lines.filter(ledger=self.ledger, credit_amount=invoice_credit.grand_total).first()
        self.assertIsNotNone(supplier_credit_line)
        payment_je_credit = JournalEntry.objects.filter(source_type='PURCHASE_PAYMENT', source_id=invoice_credit.id).first()
        self.assertIsNone(payment_je_credit)
        payload_cash = self._create_payload(purchase_type='cash')
        payload_cash['invoiceNo'] = 'TEST-INV-CASH'
        invoice_cash = atomic_purchase_save(payload_cash, str(self.outlet.id), str(self.user.id))
        payment_je_cash = JournalEntry.objects.filter(source_type='PURCHASE_PAYMENT', source_id=invoice_cash.id).first()
        self.assertIsNotNone(payment_je_cash)
        cash_credit_line = payment_je_cash.lines.filter(ledger=self.cash_ledger, credit_amount=invoice_cash.grand_total).first()
        self.assertIsNotNone(cash_credit_line)
        supplier_debit_line_payment = payment_je_cash.lines.filter(ledger=self.ledger, debit_amount=invoice_cash.grand_total).first()
        self.assertIsNotNone(supplier_debit_line_payment)

    def test_unit_conversions_batch_stock(self):
        payload = self._create_payload()
        invoice = atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        item = invoice.items.first()
        batch = item.batch
        self.assertEqual(batch.qty_strips, 10)
        sl = StockLedger.objects.filter(batch=batch, txn_type='PURCHASE_IN').first()
        self.assertIsNotNone(sl)
        self.assertEqual(sl.qty_in, 10)
        self.assertEqual(sl.qty_out, 0)

    def test_rollback(self):
        initial_invoices = PurchaseInvoice.objects.count()
        initial_je = JournalEntry.objects.count()
        initial_batches = Batch.objects.count()
        payload = self._create_payload(fail_deliberately=True)
        with self.assertRaises(Exception):
            atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        self.assertEqual(PurchaseInvoice.objects.count(), initial_invoices)
        self.assertEqual(JournalEntry.objects.count(), initial_je)
        self.assertEqual(Batch.objects.count(), initial_batches)