from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.utils import timezone
from django.test import TestCase
from apps.billing.models import SaleInvoice, SaleItem, BillRevision
from apps.billing.revision_service import (
    build_invoice_snapshot,
    compute_bill_revision_diff,
    generate_revision_number,
    create_bill_revision_record
)
from apps.accounts.models import Staff
from apps.core.models import Outlet, Organization

class TestRevisionService(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(organization=self.org, name="Test Outlet")
        self.staff = Staff.objects.create(outlet=self.outlet, name="Admin", role="admin", phone="1234567890")
        
        self.invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-100",
            invoice_date=timezone.now(),
            subtotal=Decimal("100.00"),
            taxable_amount=Decimal("100.00"),
            grand_total=Decimal("100.00"),
            payment_mode="cash",
            cash_paid=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
            amount_due=Decimal("0.00")
        )

    def test_build_invoice_snapshot(self):
        snapshot = build_invoice_snapshot(self.invoice)
        
        self.assertEqual(snapshot['invoice_no'], "INV-100")
        self.assertEqual(snapshot['grand_total'], "100.00")
        self.assertEqual(snapshot['amount_paid'], "100.00")
        self.assertIn('items', snapshot)
        self.assertEqual(len(snapshot['items']), 0)

    def test_compute_bill_revision_diff(self):
        old_snapshot = {
            'grand_total': '100.00',
            'subtotal': '100.00',
            'items': [
                {'id': 'item-1', 'product_name': 'Drug A', 'qty_strips': 1, 'rate': '50.00'},
                {'id': 'item-2', 'product_name': 'Drug B', 'qty_strips': 1, 'rate': '50.00'},
            ]
        }
        
        new_snapshot = {
            'grand_total': '120.00',
            'subtotal': '120.00',
            'items': [
                {'id': 'item-1', 'product_name': 'Drug A', 'qty_strips': 1, 'rate': '50.00'},
                {'id': 'item-2', 'product_name': 'Drug B', 'qty_strips': 1, 'rate': '70.00'},
                {'id': 'item-3', 'product_name': 'Drug C', 'qty_strips': 1, 'rate': '10.00'},
            ]
        }
        
        diff = compute_bill_revision_diff(old_snapshot, new_snapshot)
        
        self.assertIn('grand_total', diff['financial'])
        self.assertEqual(diff['financial']['grand_total']['old'], '100.00')
        self.assertEqual(diff['financial']['grand_total']['new'], '120.00')
        
        self.assertEqual(len(diff['items_added']), 1)
        self.assertEqual(diff['items_added'][0]['id'], 'item-3')
        
        self.assertEqual(len(diff['items_modified']), 1)
        self.assertEqual(diff['items_modified'][0]['id'], 'item-2')
        self.assertEqual(diff['items_modified'][0]['changes']['rate']['new'], '70.00')
        
        self.assertEqual(len(diff['items_removed']), 0)

    def test_generate_revision_number(self):
        rev_num = generate_revision_number(self.invoice)
        self.assertEqual(rev_num, "INV-100-R1")
        
        BillRevision.objects.create(
            outlet=self.invoice.outlet,
            original_invoice=self.invoice,
            revision_number=rev_num,
            revision_type="correction"
        )
        
        rev_num2 = generate_revision_number(self.invoice)
        self.assertEqual(rev_num2, "INV-100-R2")

    @patch('apps.billing.revision_service.log_activity')
    def test_create_bill_revision_record(self, mock_log_activity):
        new_snapshot = build_invoice_snapshot(self.invoice)
        old_snapshot = build_invoice_snapshot(self.invoice)
        new_snapshot['grand_total'] = "120.00"
        
        revision = create_bill_revision_record(
            invoice=self.invoice,
            old_snapshot=old_snapshot,
            new_snapshot=new_snapshot,
            revision_type="financial_change",
            modified_by=self.staff,
            reason_code="RATE_CORRECTION",
            reason_text="Updated rate for item"
        )
        
        self.assertIsNotNone(revision)
        self.assertEqual(revision.revision_number, "INV-100-R1")
        self.assertEqual(revision.revision_type, "financial_change")
        self.assertEqual(revision.reason_code, "RATE_CORRECTION")
        self.assertEqual(revision.diff_summary_json['financial']['grand_total']['old'], "100.00")
        self.assertEqual(revision.diff_summary_json['financial']['grand_total']['new'], "120.00")
        self.assertEqual(revision.payment_impact_json['additional_collection_required'], "20.00")
        
        mock_log_activity.assert_called_once()
        args, kwargs = mock_log_activity.call_args
        self.assertEqual(kwargs['action'], "BILL_REVISION_CREATED")
        self.assertEqual(kwargs['entity_id'], self.invoice.id)
