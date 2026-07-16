from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice, make_test_sales_return, make_test_receipt
from apps.inventory.models import Batch
from apps.audit.models import ActivityLog

class RevisionBlocksTestCase(BaseRevisionTestCase):

    def test_block_edit_invoice_with_return(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_sales_return(
            self.outlet, self.billing_staff, invoice,
            items=[{'sale_item': invoice.items.first(), 'qty': 3}]
        )
        
        self.batch.refresh_from_db()
        batch_qty_before = self.batch.qty_strips

        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test return block',
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 5,
                'rate': 10
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot commercial correction a bill with returns', response.data.get('detail', ''))
        
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, batch_qty_before)
        
        # Check that it didn't create a BillRevision
        from apps.audit.models import DocumentRevision
        from django.contrib.contenttypes.models import ContentType
        self.assertEqual(DocumentRevision.objects.filter(object_id=invoice.id).count(), 0)

    def test_block_edit_fully_paid_invoice(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_receipt(self.outlet, self.billing_staff, invoice, amount=50, date_offset_days=0)
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test paid block',
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot commercially correct a paid bill', response.data.get('detail', ''))

    def test_block_edit_invoice_with_later_payment(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_receipt(self.outlet, self.billing_staff, invoice, amount=20, date_offset_days=1)
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test later payment block',
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot commercially correct a paid bill', response.data.get('detail', ''))

    def test_block_fires_before_any_write(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_sales_return(
            self.outlet, self.billing_staff, invoice,
            items=[{'sale_item': invoice.items.first(), 'qty': 3}]
        )
        
        self.batch.refresh_from_db()
        batch_qty_before = self.batch.qty_strips
        from apps.billing.models import LedgerEntry
        from apps.audit.models import DocumentRevision
        from django.contrib.contenttypes.models import ContentType
        journal_count_before = LedgerEntry.objects.count()

        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test block before write',
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 5,
                'rate': 10
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, batch_qty_before)
        self.assertEqual(LedgerEntry.objects.count(), journal_count_before)
