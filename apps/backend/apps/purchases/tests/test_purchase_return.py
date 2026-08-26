from django.test import TestCase
from decimal import Decimal
from datetime import date
from django.db import transaction
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Ledger, LedgerGroup, JournalEntry, JournalLine, DebitNote, DebitNoteItem
from apps.purchases.models import Distributor, PurchaseInvoice
from apps.inventory.models import MasterProduct, Batch, StockLedger
from apps.accounts.services import DebitNoteService
from apps.accounts.debit_note_update_service import atomic_debit_note_update
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError

class PurchaseReturnTest(TestCase):

    def setUp(self):
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(name='Test Outlet', organization=self.org)
        self.user = Staff.objects.create(name='testuser', phone='9999999999', outlet=self.outlet, role='admin')
        self.distributor = Distributor.objects.create(outlet=self.outlet, name='Test Distributor', credit_days=15)
        self.sundry_creditors = LedgerGroup.objects.create(name='Sundry Creditors', outlet=self.outlet, nature='liability')
        self.purchase_accounts = LedgerGroup.objects.create(name='Purchase Accounts', outlet=self.outlet, nature='expense')
        self.distributor_ledger = Ledger.objects.create(outlet=self.outlet, name='Test Distributor', group=self.sundry_creditors, linked_distributor=self.distributor)
        self.purchase_returns_ledger = Ledger.objects.create(outlet=self.outlet, name='Purchase Returns', group=self.purchase_accounts)
        self.duties_taxes = LedgerGroup.objects.create(name='Duties & Taxes', outlet=self.outlet, nature='liability')
        self.cgst_ledger = Ledger.objects.create(outlet=self.outlet, name='GST Input (CGST)', group=self.duties_taxes)
        self.sgst_ledger = Ledger.objects.create(outlet=self.outlet, name='GST Input (SGST)', group=self.duties_taxes)
        self.product = MasterProduct.objects.create(name='Test Medicine', mrp=Decimal('100.00'), pack_size=10, pack_unit='tablet', pack_type='strip')
        self.batch = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='BATCH-RET', expiry_date='2026-12-01', mrp=Decimal('150.00'), purchase_rate=Decimal('100.00'), pack_size=10, qty_strips=20, qty_loose=0)
        StockLedger.objects.create(
            outlet=self.outlet,
            product=self.product,
            batch=self.batch,
            txn_type='PURCHASE_IN',
            txn_date=date(2026, 1, 1),
            voucher_type='Initial',
            voucher_number='INIT',
            qty_in=20,
            qty_out=0,
            rate=Decimal('100.00'),
            running_qty=20
        )
    def _create_payload(self, qty=10, fail=False):
        return {'outletId': str(self.outlet.id), 'distributor_id': str(self.distributor.id), 'date': date.today().isoformat(), 'reason': 'Expired Goods', 'subtotal': Decimal('1000.00') if not fail else Decimal('1000.00'), 'gst_amount': Decimal('120.00'), 'total_amount': Decimal('1120.00'), 'items': [{'batch_id': str(self.batch.id) if not fail else '00000000-0000-0000-0000-000000000000', 'product_name': 'Test Medicine', 'qty': Decimal(str(qty)), 'rate': Decimal('100.00'), 'gst_rate': Decimal('12.00'), 'total': Decimal('1120.00')}]}

    def test_return_creation_accounting(self):
        payload = self._create_payload(qty=5)
        DebitNoteService.create(str(self.outlet.id), str(self.user.id), payload)
        note = DebitNote.objects.first()
        self.assertIsNotNone(note)
        je = JournalEntry.objects.filter(source_type='RETURN', source_id=note.id).first()
        self.assertIsNotNone(je)
        supplier_debit = je.lines.filter(ledger=self.distributor_ledger).first()
        self.assertIsNotNone(supplier_debit)
        self.assertEqual(supplier_debit.debit_amount, note.total_amount)
        return_credit = je.lines.filter(ledger=self.purchase_returns_ledger).first()
        self.assertIsNotNone(return_credit)
        self.assertEqual(return_credit.credit_amount, note.subtotal)

    def test_stock_reversal(self):
        payload = self._create_payload(qty=5)
        DebitNoteService.create(str(self.outlet.id), str(self.user.id), payload)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, 15)
        note = DebitNote.objects.first()
        sl = StockLedger.objects.filter(batch=self.batch, txn_type='PURCHASE_RETURN').first()
        self.assertIsNotNone(sl)
        self.assertEqual(sl.qty_out, 5)

    def test_return_edit_revision(self):
        payload = self._create_payload(qty=5)
        DebitNoteService.create(str(self.outlet.id), str(self.user.id), payload)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, 15)
        note = DebitNote.objects.first()
        item = note.items.first()
        update_payload = {'outletId': str(self.outlet.id), 'distributor_id': str(self.distributor.id), 'date': date.today().isoformat(), 'reason': 'Damaged Goods', 'subtotal': '800.00', 'gst_amount': '96.00', 'total_amount': '896.00', 'revisionReasonCode': 'correction', 'revisionReasonText': 'Wrong quantity', 'items': [{'id': str(item.id), 'batch_id': str(self.batch.id), 'product_name': 'Test Medicine', 'qty': 4, 'rate': '200.00', 'gst_rate': '12.00', 'total': '896.00'}]}
        atomic_debit_note_update(debit_note_id=str(note.id), outlet_id=str(self.outlet.id), payload=update_payload, staff_id=str(self.user.id))
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, 16)
        note.refresh_from_db()
        self.assertEqual(note.total_amount, Decimal('448.00'))

    def test_rollback_safety(self):
        initial_notes = DebitNote.objects.count()
        initial_batches = self.batch.qty_strips
        initial_je = JournalEntry.objects.count()
        payload = self._create_payload(qty=5, fail=True)
        with self.assertRaises(ValidationError):
            DebitNoteService.create(str(self.outlet.id), str(self.user.id), payload)
        self.batch.refresh_from_db()
        self.assertEqual(DebitNote.objects.count(), initial_notes)
        self.assertEqual(self.batch.qty_strips, initial_batches)
        self.assertEqual(JournalEntry.objects.count(), initial_je)