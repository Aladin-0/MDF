from decimal import Decimal
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, Voucher, VoucherLine, Ledger, LedgerGroup, Customer, JournalEntry, JournalLine
from django.contrib.auth.hashers import make_password
from apps.audit.models import DocumentRevisionV2
from unittest.mock import patch
from apps.accounts.journal_service import post_voucher
from apps.billing.models import SaleInvoice
from apps.accounts.models import VoucherBillAdjustment

@override_settings(AUDIT_V2_WRITE_ENABLED=True)
class VoucherModTests(TestCase):
    def setUp(self):
        self.patcher = patch('apps.audit.services.create_audit_log_async.delay')
        self.mock_delay = self.patcher.start()
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        
        self.admin = Staff.objects.create(
            phone="9999999999", name="Admin", outlet=self.outlet, 
            role="admin", password=make_password("password123")
        )
        self.billing = Staff.objects.create(
            phone="8888888888", name="Billing", outlet=self.outlet, 
            role="billing_staff", password=make_password("password123")
        )
        
        self.group = LedgerGroup.objects.create(outlet=self.outlet, name="Test Group", nature="asset")
        self.ledger1 = Ledger.objects.create(outlet=self.outlet, name="L1", group=self.group)
        self.ledger2 = Ledger.objects.create(outlet=self.outlet, name="L2", group=self.group)
        self.ledger3 = Ledger.objects.create(outlet=self.outlet, name="L3", group=self.group)
        
        self.voucher = Voucher.objects.create(
            outlet=self.outlet,
            voucher_type="receipt",
            voucher_no="RCT-001",
            date="2026-07-01",
            narration="Initial narration",
            total_amount=Decimal('500.00'),
            created_by=self.admin,
            status='posted'
        )
        self.line1 = VoucherLine.objects.create(
            voucher=self.voucher, ledger=self.ledger1, debit=Decimal('500.00'), credit=Decimal('0.00')
        )
        self.line2 = VoucherLine.objects.create(
            voucher=self.voucher, ledger=self.ledger2, debit=Decimal('0.00'), credit=Decimal('500.00')
        )
        post_voucher(self.voucher)
        
        self.customer = Customer.objects.create(outlet=self.outlet, name="Cust", phone="1234567")
        self.invoice = SaleInvoice.objects.create(
            outlet=self.outlet, customer=self.customer,
            invoice_no="INV-99", invoice_date="2026-07-01 10:00:00Z",
            subtotal=Decimal('1000.00'), taxable_amount=Decimal('1000.00'),
            grand_total=Decimal('1000.00'), payment_mode='credit',
            amount_paid=Decimal('0.00'), amount_due=Decimal('1000.00')
        )
        
    def tearDown(self):
        self.patcher.stop()
        
    def test_voucher_revise_logs_diff(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-02',
            'narration': 'Updated narration',
            'total_amount': '600.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Wrong amount explanation here',
            'lines': [
                {'ledger_id': str(self.ledger1.id), 'debit': '600.00', 'credit': '0.00'},
                {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '600.00'}
            ],
            'bill_adjustments': []
        }
        
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        
        self.voucher.refresh_from_db()
        self.assertEqual(self.voucher.narration, "Updated narration")
        self.assertEqual(self.voucher.total_amount, Decimal('600.00'))
        self.assertEqual(str(self.voucher.date), '2026-07-02')
        
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(Voucher)
        revs = DocumentRevisionV2.objects.filter(content_type=ct, object_id=str(self.voucher.id))
        self.assertEqual(revs.count(), 1)
        
        diff = revs.first().diff_summary_json
        self.assertEqual(diff['narration']['new'], 'Updated narration')
        self.assertEqual(str(diff['total_amount']['new']), '600.00')

    def test_voucher_payment_mode_switch(self):
        # Switching one of the ledgers (e.g. from cash to bank)
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Initial narration',
            'total_amount': '500.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Switched ledger',
            'lines': [
                {'ledger_id': str(self.ledger3.id), 'debit': '500.00', 'credit': '0.00'},
                {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '500.00'}
            ],
            'bill_adjustments': []
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200)
        
        self.voucher.refresh_from_db()
        lines = list(self.voucher.lines.all())
        self.assertTrue(any(l.ledger == self.ledger3 for l in lines))

    def test_voucher_ledger_rewrite(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Initial narration',
            'total_amount': '500.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Rewrote ledgers',
            'lines': [
                {'ledger_id': str(self.ledger2.id), 'debit': '500.00', 'credit': '0.00'},
                {'ledger_id': str(self.ledger3.id), 'debit': '0.00', 'credit': '500.00'}
            ],
            'bill_adjustments': []
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_voucher_invoice_link(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Linked invoice',
            'total_amount': '500.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Linked invoice to voucher',
            'lines': [
                {'ledger_id': str(self.ledger1.id), 'debit': '500.00', 'credit': '0.00'},
                {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '500.00'}
            ],
            'bill_adjustments': [
                {
                    'invoice_type': 'sale',
                    'invoice_id': str(self.invoice.id),
                    'adjusted_amount': 500.00
                }
            ]
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_due, Decimal('500.00'))

    def test_voucher_invoice_unlink(self):
        # Setup: initially linked
        VoucherBillAdjustment.objects.create(
            voucher=self.voucher, invoice_type='sale', sale_invoice_id=self.invoice.id, adjusted_amount=Decimal('500.00')
        )
        self.invoice.amount_due = Decimal('500.00')
        self.invoice.save()

        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Unlinked invoice',
            'total_amount': '500.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Unlinked invoice',
            'lines': [
                {'ledger_id': str(self.ledger1.id), 'debit': '500.00', 'credit': '0.00'},
                {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '500.00'}
            ],
            'bill_adjustments': []
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_due, Decimal('1000.00'))

    def test_voucher_validation_reason_code_missing(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Updated narration',
            'total_amount': '500.00',
            'revisionReasonText': 'Wrong amount explanation here',
            'lines': [{'ledger_id': str(self.ledger1.id), 'debit': '500.00', 'credit': '0.00'}, {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '500.00'}],
            'bill_adjustments': []
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('reason code', str(resp.data))

    def test_voucher_validation_explanation_too_short(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Updated narration',
            'total_amount': '500.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'short',
            'lines': [{'ledger_id': str(self.ledger1.id), 'debit': '500.00', 'credit': '0.00'}, {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '500.00'}],
            'bill_adjustments': []
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('at least 10 characters', str(resp.data))

    @patch('apps.accounts.voucher_update_service.post_voucher')
    def test_voucher_rollback_business_update_fails(self, mock_post_voucher):
        mock_post_voucher.side_effect = Exception("Forced error")
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Bad update',
            'total_amount': '600.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Will fail anyway',
            'lines': [{'ledger_id': str(self.ledger1.id), 'debit': '600.00', 'credit': '0.00'}, {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '600.00'}],
            'bill_adjustments': []
        }
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.voucher.refresh_from_db()
        self.assertEqual(self.voucher.total_amount, Decimal('500.00')) # Rollback occurred

    @patch('apps.audit.core.orchestrator.record_mutation')
    def test_voucher_rollback_audit_write_fails(self, mock_record):
        mock_record.side_effect = Exception("Audit failure")
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Another bad update',
            'total_amount': '600.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Will fail audit',
            'lines': [{'ledger_id': str(self.ledger1.id), 'debit': '600.00', 'credit': '0.00'}, {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '600.00'}],
            'bill_adjustments': []
        }
        # In Django atomic blocks, if an exception is raised, it throws a 500 or gets handled by the view.
        # But wait, atomic_voucher_update raises the error which is caught by view and returns 400.
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.voucher.refresh_from_db()
        self.assertEqual(self.voucher.total_amount, Decimal('500.00'))

    def test_voucher_no_duplicate_journal_entries(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        payload = {
            'outletId': str(self.outlet.id),
            'voucher_type': 'receipt',
            'date': '2026-07-01',
            'narration': 'Updated narration',
            'total_amount': '500.00',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Updating to check duplicates',
            'lines': [{'ledger_id': str(self.ledger1.id), 'debit': '500.00', 'credit': '0.00'}, {'ledger_id': str(self.ledger2.id), 'debit': '0.00', 'credit': '500.00'}],
            'bill_adjustments': []
        }
        initial_jes = JournalEntry.objects.filter(source_type='VOUCHER', source_id=str(self.voucher.id)).count()
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200)
        final_jes = JournalEntry.objects.filter(source_type='VOUCHER', source_id=str(self.voucher.id)).count()
        self.assertEqual(initial_jes, 1)
        self.assertEqual(final_jes, 1)

    def test_voucher_unauthorized(self):
        self.client.force_authenticate(user=self.billing)
        url = reverse('voucher-detail', kwargs={'voucher_id': self.voucher.id}) + f"?outletId={self.outlet.id}"
        resp = self.client.put(url, {'outletId': str(self.outlet.id)}, format='json')
        self.assertEqual(resp.status_code, 403)
