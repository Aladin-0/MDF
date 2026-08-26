from django.test import override_settings
from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice, make_test_sales_return
from apps.audit.models import ActivityLog
from apps.audit.models import DocumentRevisionV2
from django.contrib.contenttypes.models import ContentType
from unittest.mock import patch

@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class RevisionAuditTestCase(BaseRevisionTestCase):

    def test_audit_log_full_diff(self):
        invoice = make_test_invoice(self.outlet, self.billing_staff, self.customer, items=[{'batch': self.batch, 'qty': 5, 'rate': 10}], status='finalized', paid=0)
        self.authenticate_as(self.billing_staff)
        payload = {'customerId': str(self.customer.id), 'revisionAction': 'commercial_correction', 'revisionReasonCode': 'CUSTOMER_REQUEST', 'revisionReasonText': 'test audit full diff', 'grandTotal': 30, 'cashPaid': 30, 'items': [{'productId': str(self.medicine.id), 'batchId': str(self.batch.id), 'productName': self.medicine.name, 'batchNo': self.batch.batch_no, 'qtyStrips': 3, 'rate': 10}]}
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rev = DocumentRevisionV2.objects.filter(object_id=invoice.id).latest('created_at')
        self.assertIsNotNone(rev)
        
        old_snapshot = rev.old_snapshot_json
        new_snapshot = rev.new_snapshot_json
        self.assertEqual(float(old_snapshot.get('financial', {}).get('grand_total', 0)), 50.0)
        self.assertEqual(float(new_snapshot.get('financial', {}).get('grand_total', 0)), 30.0)

    @patch('apps.billing.sale_update_service.atomic_sale_update')
    def test_audit_log_not_written_on_rollback(self, mock_save):
        mock_save.side_effect = Exception('Simulate mid-transaction failure')
        invoice = make_test_invoice(self.outlet, self.billing_staff, self.customer, items=[{'batch': self.batch, 'qty': 5, 'rate': 10}], status='finalized', paid=0)
        log_count_before = ActivityLog.objects.count()
        self.authenticate_as(self.billing_staff)
        payload = {'customerId': str(self.customer.id), 'revisionAction': 'commercial_correction', 'revisionReasonCode': 'CUSTOMER_REQUEST', 'revisionReasonText': 'test rollback', 'grandTotal': 30, 'cashPaid': 30, 'items': [{'productId': str(self.medicine.id), 'batchId': str(self.batch.id), 'productName': self.medicine.name, 'batchNo': self.batch.batch_no, 'qtyStrips': 3, 'rate': 10}]}
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        try:
            self.client.post(url, payload, format='json')
        except Exception:
            pass
        self.assertEqual(ActivityLog.objects.count(), log_count_before)

    def test_no_revision_record_on_blocked(self):
        invoice = make_test_invoice(self.outlet, self.billing_staff, self.customer, items=[{'batch': self.batch, 'qty': 10, 'rate': 10}], status='finalized', paid=0)
        make_test_sales_return(self.outlet, self.billing_staff, invoice, items=[{'sale_item': invoice.items.first(), 'qty': 3}])
        self.authenticate_as(self.billing_staff)
        payload = {'customerId': str(self.customer.id), 'revisionAction': 'commercial_correction', 'revisionReasonCode': 'CUSTOMER_REQUEST', 'revisionReasonText': 'test no revision on block', 'items': [{'productId': str(self.medicine.id), 'batchId': str(self.batch.id), 'productName': self.medicine.name, 'batchNo': self.batch.batch_no, 'qtyStrips': 5, 'rate': 10}]}
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DocumentRevisionV2.objects.filter(object_id=invoice.id).count(), 0)