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
        return {'outletId': str(self.outlet.id), 'partyLedgerId': str(self.ledger.id), 'invoiceNo': 'TEST-INV-001', 'invoiceDate': date.today().isoformat() + 'T00:00:00Z', 'purchaseType': purchase_type, 'subtotal': 1000.0, 'discountAmount': 100.0, 'taxableAmount': 900.0, 'gstAmount': 108.0, 'cessAmount': 20.0, 'freight': 50.0, 'grandTotal': 1078.0, 'items': [{'masterProductId': str(self.product.id), 'batchNo': 'BATCH-TEST', 'expiryDate': '2026-12-01T00:00:00Z', 'qty': 10, 'actualQty': 100, 'purchaseRate': 100.0, 'mrp': 150.0, 'saleRate': 120.0, 'discountPct': 10.0, 'taxableAmount': 900.0, 'gstRate': 12.0, 'gstAmount': 108.0, 'cess': 2.0, 'cessAmount': 20.0, 'totalAmount': 1028.0, 'ptr': 100.0, 'pts': 90.0} if not fail_deliberately else {'masterProductId': str(self.product.id), 'batchNo': 'BATCH-TEST', 'expiryDate': 'INVALID-DATE', 'qty': 10, 'actualQty': 100, 'purchaseRate': 100.0, 'mrp': 150.0, 'saleRate': 120.0, 'taxableAmount': 900.0, 'gstAmount': 108.0, 'totalAmount': 1028.0, 'ptr': 100.0, 'pts': 90.0}]}

    def test_landing_price_computation(self):
        payload = self._create_payload()
        invoice = atomic_purchase_save(payload, str(self.outlet.id), str(self.user.id))
        item = invoice.items.first()
        base_cost = item.purchase_rate * Decimal(item.qty)
        after_trade = base_cost * (Decimal('1') - item.discount_pct / Decimal('100'))
        after_cash = after_trade * (Decimal('1') - item.cash_discount_pct / Decimal('100'))
        total_eff_qty = Decimal(item.qty + item.free_qty)
        base_rate = (after_cash / total_eff_qty).quantize(Decimal('0.0001')) if total_eff_qty > 0 else item.purchase_rate
        expected_landing_rate = (base_rate + item.freight_per_unit + item.other_cost_per_unit).quantize(Decimal('0.0001'))
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

    # ── the landing cost is written on the BATCH (billing sells from the batch) ──

    def _budecort_payload(self):
        """Bought 30 + 10 free at 19.49, GST 5%: a pack cost 19.49 x 30 / 40 = 14.6175."""
        p = self._create_payload()
        p['invoiceNo'] = 'TEST-INV-BUD'
        p['items'][0].update({'batchNo': '6T00178', 'qty': 30, 'freeQty': 10, 'actualQty': 400, 'purchaseRate': 19.49, 'discountPct': 0,
                              'gstRate': 5.0, 'cess': 0, 'cessAmount': 0, 'mrp': 25.58, 'ptr': 19.49, 'pts': 19.49, 'baseLandingRate': 14.62,
                              'taxableAmount': 584.7, 'gstAmount': 29.24, 'totalAmount': 613.94})
        return p

    def test_a_purchase_writes_the_landing_cost_on_the_batch(self):
        """It used to be stored on the purchase line only: the batch had none and billing fell back to the PTR."""
        invoice = atomic_purchase_save(self._budecort_payload(), str(self.outlet.id), str(self.user.id))
        item = invoice.items.first()
        self.assertEqual(item.landing_rate, Decimal('14.6175'))                  # no outlet settings: GST is not a cost
        self.assertEqual(item.batch.landing_rate, Decimal('14.62'))

    def test_the_landing_cost_is_cost_plus_gst_when_the_outlet_counts_gst(self):
        from apps.core.models import OutletSettings
        OutletSettings.objects.update_or_create(outlet=self.outlet, defaults={'gst_registered': True, 'landing_cost_include_gst': True})
        self.outlet.refresh_from_db()
        invoice = atomic_purchase_save(self._budecort_payload(), str(self.outlet.id), str(self.user.id))
        item = invoice.items.first()
        self.assertEqual(item.landing_rate, Decimal('15.3484'))                  # 14.6175 + 5%
        self.assertEqual(item.batch.landing_rate, Decimal('15.35'))
        # and that, not the PTR of 19.49, is what a retail sale is held to
        from apps.billing.utils.pricing import cost_floor_per_pack
        self.assertEqual(cost_floor_per_pack(item.batch, 'RETAIL')[0], Decimal('15.35'))

    def test_discounts_freight_and_cess_are_part_of_the_rule(self):
        from apps.purchases.landing import landing_rate_per_pack
        self.assertEqual(landing_rate_per_pack(100, 10, 0, discount_pct=10), Decimal('90.0000'))
        self.assertEqual(landing_rate_per_pack(100, 10, 0, discount_pct=10, cash_discount_pct=2), Decimal('88.2000'))
        self.assertEqual(landing_rate_per_pack(100, 10, 0, discount_pct=10, gst_rate=12, cess_pct=2, include_gst=True), Decimal('102.6000'))
        self.assertEqual(landing_rate_per_pack(100, 10, 0, gst_rate=12, include_gst=False), Decimal('100.0000'))
        self.assertEqual(landing_rate_per_pack(100, 10, 2, freight_per_unit='1.5', other_cost_per_unit='0.5'), Decimal('85.3333'))
        self.assertEqual(landing_rate_per_pack(19.49, 30, 10, gst_rate=5, include_gst=True), Decimal('15.3484'))

    def test_the_fill_in_command_reports_first_and_only_fills_what_is_empty(self):
        from io import StringIO
        from django.core.management import call_command
        from apps.core.models import OutletSettings
        invoice = atomic_purchase_save(self._budecort_payload(), str(self.outlet.id), str(self.user.id))
        bought = invoice.items.first().batch
        Batch.objects.filter(pk=bought.pk).update(landing_rate=None)             # as every purchased batch was before this change
        opening = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='OPEN-1', expiry_date=date(2028, 1, 1),
                                       mrp=Decimal('150'), purchase_rate=Decimal('80'), ptr=Decimal('95'), pack_size=10, pack_unit='tablet',
                                       pack_type='strip', qty_strips=5, is_opening_stock=True)
        typed = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='TYPED-1', expiry_date=date(2028, 1, 1),
                                     mrp=Decimal('150'), purchase_rate=Decimal('80'), landing_rate=Decimal('99.99'), pack_size=10,
                                     pack_unit='tablet', pack_type='strip', qty_strips=5)
        OutletSettings.objects.update_or_create(outlet=self.outlet, defaults={'gst_registered': True, 'landing_cost_include_gst': True})

        out = StringIO()
        call_command('fill_batch_landing_cost', stdout=out)                      # dry run
        self.assertIn('Dry run', out.getvalue())
        bought.refresh_from_db()
        self.assertIsNone(bought.landing_rate)

        call_command('fill_batch_landing_cost', '--apply', stdout=StringIO())
        bought.refresh_from_db(); opening.refresh_from_db(); typed.refresh_from_db()
        self.assertEqual(bought.landing_rate, Decimal('15.35'))                  # from its purchase line: 14.6175 + 5%
        self.product.refresh_from_db()
        self.assertEqual(opening.landing_rate, (Decimal('80') * (1 + self.product.gst_rate / 100)).quantize(Decimal('0.01')))   # no purchase line: its purchase rate + GST
        self.assertEqual(typed.landing_rate, Decimal('99.99'))                   # one that already has a landing cost is never touched

    def test_the_fill_in_command_leaves_sold_out_batches_alone_unless_asked(self):
        """Profit reports read the batch's landing cost: filling a sold-out batch would re-state finished sales."""
        from io import StringIO
        from django.core.management import call_command
        gone = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='GONE-1', expiry_date=date(2028, 1, 1),
                                    mrp=Decimal('150'), purchase_rate=Decimal('80'), pack_size=10, pack_unit='tablet',
                                    pack_type='strip', qty_strips=0, qty_loose=0)
        call_command('fill_batch_landing_cost', '--apply', stdout=StringIO())
        gone.refresh_from_db()
        self.assertIsNone(gone.landing_rate)
        call_command('fill_batch_landing_cost', '--apply', '--all', stdout=StringIO())
        gone.refresh_from_db()
        self.assertEqual(gone.landing_rate, Decimal('80.00'))                    # no outlet settings here: GST is not counted

