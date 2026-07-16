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
        self.distributor = Distributor.objects.create(
            outlet=self.outlet, name="Test Dist", phone="7777777777"
        )
        
        from apps.accounts.models import LedgerGroup, Ledger
        self.sundry_creditors = LedgerGroup.objects.create(outlet=self.outlet, name="Sundry Creditors", nature="liability")
        self.purchase_accounts = LedgerGroup.objects.create(outlet=self.outlet, name="Purchase Accounts", nature="expense")
        self.duties_taxes = LedgerGroup.objects.create(outlet=self.outlet, name="Duties & Taxes", nature="liability")
        
        self.distributor_ledger = Ledger.objects.create(outlet=self.outlet, name="Test Dist", group=self.sundry_creditors, linked_distributor=self.distributor)
        self.purchase_returns = Ledger.objects.create(outlet=self.outlet, name="Purchase Returns", group=self.purchase_accounts)
        self.cgst = Ledger.objects.create(outlet=self.outlet, name="GST Input (CGST)", group=self.duties_taxes)
        self.sgst = Ledger.objects.create(outlet=self.outlet, name="GST Input (SGST)", group=self.duties_taxes)
        
        self.product = MasterProduct.objects.create(name="Dolo 650", mrp=Decimal('10.00'), default_sale_rate=Decimal('10.00'), pack_size=10, pack_unit='tablet', pack_type='strip')
        self.batch = Batch.objects.create(outlet=self.outlet, product=self.product, batch_no="B-001", expiry_date="2026-12-31", mrp=Decimal('10.00'), purchase_rate=Decimal('8.00'), sale_rate=Decimal('10.00'))
        
        # Create an initial debit note
        self.note = DebitNote.objects.create(
            outlet=self.outlet,
            distributor=self.distributor,
            debit_note_no="DN-001",
            date="2026-07-01",
            reason="Expired Goods",
            subtotal=Decimal('100.00'),
            gst_amount=Decimal('5.00'),
            total_amount=Decimal('105.00'),
            created_by=self.admin
        )
        self.item = DebitNoteItem.objects.create(
            debit_note=self.note,
            batch=self.batch,
            product_name="Dolo 650",
            qty=10,
            rate=Decimal('10.00'),
            gst_rate=Decimal('5.00'),
            total=Decimal('105.00')
        )
        
    def tearDown(self):
        self.patcher.stop()
        
    def test_direct_revise_modifies_and_logs(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('debit-note-detail', kwargs={'pk': self.note.id}) + f"?outletId={self.outlet.id}"
        
        # Edit the total amount
        payload = {
            'outletId': str(self.outlet.id),
            'distributor_id': str(self.distributor.id),
            'date': '2026-07-01',
            'reason': 'Damaged Goods',  # changed reason
            'subtotal': '50.00',
            'gst_amount': '2.50',
            'total_amount': '52.50',
            'revisionReasonCode': 'correction',
            'revisionReasonText': 'Wrong reason and amounts',
            'items': [
                {
                    'id': str(self.item.id),
                    'batch_id': str(self.batch.id),
                    'product_name': 'Dolo 650',
                    'qty': 5, # changed qty
                    'rate': '10.00',
                    'gst_rate': '5.00',
                    'total': '50.00'
                }
            ]
        }
        
        resp = self.client.put(url, payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        
        self.note.refresh_from_db()
        self.assertEqual(self.note.reason, "Damaged Goods")
        self.assertEqual(self.note.total_amount, Decimal('52.50'))
        
        # Assert DocumentRevision is created
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(DebitNote)
        revs = DocumentRevision.objects.filter(content_type=ct, object_id=str(self.note.id))
        self.assertEqual(revs.count(), 1)
        rev = revs.first()
        self.assertEqual(rev.revision_type, 'MODIFICATION')
        diff = rev.diff_summary_json
        
        # Check diff captured the change
        self.assertIn('reason', diff['header'])
        self.assertEqual(diff['header']['reason']['old'], 'Expired Goods')
        self.assertEqual(diff['header']['reason']['new'], 'Damaged Goods')
        
    def test_unauthorized_user_cannot_edit(self):
        self.client.force_authenticate(user=self.billing)
        url = reverse('debit-note-detail', kwargs={'pk': self.note.id}) + f"?outletId={self.outlet.id}"
        payload = {'outletId': str(self.outlet.id)}
        resp = self.client.put(url, payload, format='json')
        # Billing staff don't have IsManagerOrAbove permission, should be 403
        self.assertEqual(resp.status_code, 403)
