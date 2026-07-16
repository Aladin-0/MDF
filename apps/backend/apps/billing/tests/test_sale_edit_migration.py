from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice
from apps.billing.models import SaleInvoice, SaleItem, LedgerEntry
from apps.inventory.models import StockLedger, Batch
from apps.audit.models import DocumentRevisionV2, ActivityEvent, SystemEvent
from unittest.mock import patch
from apps.audit.core import flags
import json

class SaleEditMigrationTests(BaseRevisionTestCase):
    def setUp(self):
        super().setUp()
        flags.ENABLE_V2_AUDIT_WRITES = True
        flags.ENABLE_V2_AUDIT_READS = True
        
        self.admin_user.role = 'admin'
        self.admin_user.can_edit_sales = True
        self.admin_user.save()
        self.admin_user.user.role = 'admin'
        self.admin_user.user.save()
        self.invoice = make_test_invoice(self.outlet, self.admin_user, customer=self.customer, items=[{'batch': self.batch, 'qty': 1, 'rate': 10}])
        self.authenticate_as(self.admin_user)

    def get_put_payload(self, invoice):
        item = invoice.items.first()
        return {
            "outletId": str(self.outlet.id),
            "revisionAction": "standard_correction",
            "revisionReasonCode": "correction",
            "revisionReasonText": "Test reason",
            "grandTotal": float(invoice.grand_total) + 10,
            "subtotal": float(invoice.subtotal) + 10,
            "cashPaid": float(invoice.grand_total) + 10,
            "items": [
                {
                    "productId": str(item.batch.product_id),
                    "batchId": str(item.batch_id),
                    "qtyStrips": item.qty_strips,
                    "qtyLoose": item.qty_loose,
                    "rate": float(item.rate) + 1,
                    "taxableAmount": float(item.taxable_amount) + 10,
                    "gstAmount": float(item.gst_amount),
                    "totalAmount": float(item.total_amount) + 10
                }
            ]
        }

    def test_sale_detail_put_happy_path(self):
        url = reverse('sale-detail', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        
        response = self.client.put(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        self.invoice.refresh_from_db()
        self.assertEqual(float(self.invoice.grand_total), payload['grandTotal'])

    def test_sale_detail_put_audit_write(self):
        url = reverse('sale-detail', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        
        response = self.client.put(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        revs = DocumentRevisionV2.objects.filter(object_id=self.invoice.id)
        self.assertEqual(revs.count(), 1)
        rev = revs.first()
        self.assertEqual(rev.action, 'standard_correction')
        
        acts = ActivityEvent.objects.filter(entity_id=str(self.invoice.id))
        sys_acts = SystemEvent.objects.filter(entity_id=str(self.invoice.id))
        self.assertEqual(acts.count() + sys_acts.count(), 1)

    @patch('apps.audit.core.orchestrator.record_revision')
    def test_sale_detail_put_rollback_on_audit_failure(self, mock_record):
        mock_record.side_effect = Exception("Audit failed")
        
        url = reverse('sale-detail', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        original_total = self.invoice.grand_total
        
        response = self.client.put(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR, response.data)
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.grand_total, original_total)

    def test_sale_revise_standard_correction_happy_path(self):
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        
        response = self.client.post(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('revisionId', response.data)
        
        rev_id = response.data['revisionId']
        self.assertTrue(DocumentRevisionV2.objects.filter(id=rev_id).exists())

    def test_sale_revise_cancel_reissue_happy_path(self):
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        payload['revisionAction'] = 'cancel_and_reissue'
        payload['revisionReasonText'] = 'Test reason'
        
        response = self.client.post(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('revisionId', response.data)
        
        new_invoice_id = response.data['id']
        self.assertNotEqual(str(self.invoice.id), new_invoice_id)
        
        self.invoice.refresh_from_db()
        self.assertTrue(self.invoice.is_cancelled)

    def test_sale_revise_cancel_reissue_metadata_persistence(self):
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        payload['revisionAction'] = 'cancel_and_reissue'
        payload['revisionReasonText'] = 'Test reason'
        
        response = self.client.post(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        new_invoice_id = response.data['id']
        
        acts = ActivityEvent.objects.filter(entity_id=str(self.invoice.id), action="cancel_and_reissue")
        sys_acts = SystemEvent.objects.filter(entity_id=str(self.invoice.id), event_name="cancel_and_reissue")
        self.assertEqual(acts.count() + sys_acts.count(), 1)
        act = acts.first() or sys_acts.first()
        self.assertEqual(act.metadata_json.get('resulting_invoice_id'), new_invoice_id)
        
        revs = DocumentRevisionV2.objects.filter(object_id=self.invoice.id, action='cancel_and_reissue')
        self.assertEqual(revs.count(), 1)
        rev = revs.first()
        self.assertEqual(rev.new_snapshot_json.get('_resulting_invoice_id'), new_invoice_id)

    def test_sale_update_rollback_on_business_failure(self):
        url = reverse('sale-detail', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        payload['items'][0]['qtyStrips'] = 9999 # over-deduct
        
        response = self.client.put(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        
        acts = ActivityEvent.objects.filter(entity_id=str(self.invoice.id))
        sys_acts = SystemEvent.objects.filter(entity_id=str(self.invoice.id))
        self.assertEqual(acts.count() + sys_acts.count(), 0)

    @patch('apps.audit.core.orchestrator.record_revision')
    def test_sale_revise_rollback_on_audit_failure(self, mock_record):
        mock_record.side_effect = Exception("Audit failed")
        
        url = reverse('sale-revise', kwargs={'sale_id': self.invoice.id})
        payload = self.get_put_payload(self.invoice)
        payload['revisionAction'] = 'cancel_and_reissue'
        
        response = self.client.post(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR, response.data)
        
        self.invoice.refresh_from_db()
        self.assertFalse(self.invoice.is_cancelled)

    def test_history_api_read_path(self):
        # Create a revision first
        self.test_sale_detail_put_audit_write()
        
        url = reverse('unified-revisions', kwargs={'record_type': 'sale', 'record_id': self.invoice.id})
        url += f"?outletId={self.outlet.id}"
        
        response = self.client.get(url, HTTP_OUTLETID=str(self.outlet.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('revisions', response.data)
        from apps.audit.models import DocumentRevisionV2
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(self.invoice)
        revs = DocumentRevisionV2.objects.filter(content_type=ct, object_id=str(self.invoice.id), tenant_id=self.outlet.id)
        if len(response.data['revisions']) != 1:
            print("REVS IN DB:", revs)
            print("CT:", ct.id)
            print("OBJECT_ID:", str(self.invoice.id))
            print("TENANT_ID:", self.outlet.id)
            all_revs = DocumentRevisionV2.objects.all()
            for ar in all_revs:
                print(f"REV: id={ar.id}, ct={ar.content_type_id}, obj={ar.object_id}, tenant={ar.tenant_id}")
        self.assertEqual(len(response.data['revisions']), 1)

    def test_history_ui_rendering_parity(self):
        self.test_sale_detail_put_audit_write()
        url = reverse('unified-revisions', kwargs={'record_type': 'sale', 'record_id': self.invoice.id}) + f"?outletId={self.outlet.id}"
        
        response = self.client.get(url, HTTP_OUTLETID=str(self.outlet.id))
        rev = response.data['revisions'][0]
        
        # Verify legacy adapter schema keys exist
        self.assertIn('original_document_id', rev)
        self.assertIn('revision_number', rev)
        self.assertIn('diff_summary_json', rev)
        self.assertIn('modified_by', rev)

    def test_sale_success_payload_shape_parity(self):
        # 1. Edit (SaleDetailView.put)
        payload = self.get_put_payload(self.invoice)
        payload['revisionAction'] = 'standard_correction'
        payload['revisionReasonCode'] = 'correction'
        payload['revisionReasonText'] = 'Fix qty'
        
        response = self.client.put(
            f'/api/v1/sales/{self.invoice.id}/',
            payload,
            format='json',
            HTTP_OUTLETID=str(self.outlet.id)
        )
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertIn('createdAt', data)
        self.assertIn('invoiceNo', data)
        self.assertIn('grandTotal', data)
        self.assertIn('paymentMode', data)
        self.assertIn('items', data)
        self.assertIn('revisionId', data)
        self.assertIn('message', data)

        # 2. Revise (SaleReviseView.post)
        payload['revisionAction'] = 'cancel_and_reissue'
        response = self.client.post(
            reverse('sale-revise', kwargs={'sale_id': self.invoice.id}),
            payload,
            format='json',
            HTTP_OUTLETID=str(self.outlet.id)
        )
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertIn('createdAt', data)
        self.assertIn('invoiceNo', data)
        self.assertIn('grandTotal', data)
        self.assertIn('paymentMode', data)
        self.assertIn('items', data)
        self.assertIn('revisionId', data)
        self.assertIn('message', data)
