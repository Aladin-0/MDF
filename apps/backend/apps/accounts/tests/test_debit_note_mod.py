from decimal import Decimal
import uuid
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from apps.core.models import Outlet, Organization
from apps.accounts.models import Staff, DebitNote, DebitNoteItem
from apps.purchases.models import Distributor
from apps.inventory.models import MasterProduct, Batch
from django.contrib.auth.hashers import make_password
from apps.audit.models import DocumentRevision
from unittest.mock import patch

class DebitNoteModTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(name='Test Outlet', organization=self.org)
        self.admin = Staff.objects.create(phone='9999999999', name='Admin', outlet=self.outlet, role='admin', password=make_password('password123'))
        self.billing = Staff.objects.create(phone='8888888888', name='Billing', outlet=self.outlet, role='billing_staff', password=make_password('password123'))
        self.distributor = Distributor.objects.create(outlet=self.outlet, name='Test Dist', phone='7777777777')
        from apps.accounts.models import LedgerGroup, Ledger
        self.sundry_creditors = LedgerGroup.objects.create(outlet=self.outlet, name='Sundry Creditors', nature='liability')
        self.purchase_accounts = LedgerGroup.objects.create(outlet=self.outlet, name='Purchase Accounts', nature='expense')
        self.duties_taxes = LedgerGroup.objects.create(outlet=self.outlet, name='Duties & Taxes', nature='liability')
        self.distributor_ledger = Ledger.objects.create(outlet=self.outlet, name='Test Dist', group=self.sundry_creditors, linked_distributor=self.distributor)
        self.purchase_returns = Ledger.objects.create(outlet=self.outlet, name='Purchase Returns', group=self.purchase_accounts)
        self.cgst = Ledger.objects.create(outlet=self.outlet, name='GST Input (CGST)', group=self.duties_taxes)
        self.sgst = Ledger.objects.create(outlet=self.outlet, name='GST Input (SGST)', group=self.duties_taxes)
        self.product = MasterProduct.objects.create(name='Dolo 650', mrp=Decimal('10.00'), pack_size=10, pack_unit='tablet', pack_type='strip')
        self.batch = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no='B-001', expiry_date='2026-12-31', mrp=Decimal('10.00'), purchase_rate=Decimal('8.00'), qty_strips=100)
        from apps.inventory.models import StockLedger
        StockLedger.objects.create(outlet=self.outlet, product=self.product, batch=self.batch, txn_type='PURCHASE_IN', txn_date='2026-01-01', voucher_type='Initial', voucher_number='INIT', qty_in=100, qty_out=0, rate=Decimal('8.00'), running_qty=100)
        self.note = DebitNote.objects.create(outlet=self.outlet, distributor=self.distributor, debit_note_no='DN-001', date='2026-07-01', reason='Expired Goods', subtotal=Decimal('100.00'), gst_amount=Decimal('5.00'), total_amount=Decimal('105.00'), created_by=self.admin)
        self.item = DebitNoteItem.objects.create(debit_note=self.note, batch=self.batch, product_name='Dolo 650', qty=10, rate=Decimal('10.00'), gst_rate=Decimal('5.00'), total=Decimal('105.00'))

    def test_direct_revise_modifies_and_logs(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('debit-note-detail', kwargs={'pk': self.note.id}) + f'?outletId={self.outlet.id}'
        payload = {'outletId': str(self.outlet.id), 'distributor_id': str(self.distributor.id), 'date': '2026-07-01', 'reason': 'Damaged Goods', 'subtotal': '50.00', 'gst_amount': '2.50', 'total_amount': '52.50', 'revisionReasonCode': 'correction', 'revisionReasonText': 'Wrong reason and amounts', 'items': [{'id': str(self.item.id), 'batch_id': str(self.batch.id), 'product_name': 'Dolo 650', 'qty': 5, 'rate': '10.00', 'gst_rate': '5.00', 'total': '50.00'}]}
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.note.refresh_from_db()
        self.assertEqual(self.note.reason, 'Damaged Goods')
        self.assertEqual(self.note.total_amount, Decimal('42.00'))
        from apps.audit.models import DocumentRevisionV2
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(DebitNote)
        revs = DocumentRevisionV2.objects.filter(content_type=ct, object_id=str(self.note.id))
        self.assertEqual(revs.count(), 1)
        rev = revs.first()
        self.assertEqual(rev.action, 'UPDATE')
        diff = rev.diff_summary_json
        self.assertIn('reason', diff['header'])
        self.assertEqual(diff['header']['reason']['old'], 'Expired Goods')
        self.assertEqual(diff['header']['reason']['new'], 'Damaged Goods')

    def test_unauthorized_user_cannot_edit(self):
        self.client.force_authenticate(user=self.billing)
        url = reverse('debit-note-detail', kwargs={'pk': self.note.id}) + f'?outletId={self.outlet.id}'
        payload = {'outletId': str(self.outlet.id), 'distributor_id': str(self.distributor.id), 'date': '2026-07-01', 'reason': 'Damaged Goods', 'subtotal': '50.00', 'gst_amount': '2.50', 'total_amount': '52.50', 'revisionReasonCode': 'correction', 'revisionReasonText': 'Testing auth', 'items': [{'id': str(self.item.id), 'batch_id': str(self.batch.id), 'product_name': 'Dolo 650', 'qty': 5, 'rate': '10.00', 'gst_rate': '5.00', 'total': '50.00'}]}
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 403)