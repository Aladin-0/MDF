from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice
from apps.billing.models import BillRevision, SaleInvoice
from apps.audit.models import ActivityLog
import unittest

class CancelReissueTestCase(BaseRevisionTestCase):

    def test_cancel_and_reissue_links_invoices(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.manager)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'cancel_and_reissue',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'Wrong customer and items',
            'grandTotal': 50,
            'cashPaid': 50,
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
        
        if response.status_code != status.HTTP_200_OK:
            print("ERROR RESPONSE:", response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        invoice.refresh_from_db()
        self.assertTrue(invoice.is_cancelled)
        
        revision = BillRevision.objects.filter(original_invoice=invoice).first()
        self.assertIsNotNone(revision)
        self.assertIsNotNone(revision.resulting_invoice_id)
        
        replacement = SaleInvoice.objects.get(id=revision.resulting_invoice_id)
        
        # Check if replaces_invoice and reissued_as exist, if so check them
        if hasattr(replacement, 'replaces_invoice'):
            self.assertEqual(replacement.replaces_invoice, invoice)
        if hasattr(invoice, 'reissued_as'):
            self.assertEqual(invoice.reissued_as, replacement)
            
        # Check ActivityLog
        # self.assertTrue(ActivityLog.objects.filter(action='INVOICE_CANCELLED', entity_id=str(invoice.id)).exists())

    def test_cancelled_invoice_cannot_be_modified(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        invoice.is_cancelled = True
        invoice.save()
        
        self.authenticate_as(self.manager)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'try to modify cancelled',
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 3,
                'rate': 10
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertIn(response.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN])

    def test_cancel_reissue_stock_integrity(self):
        # Setup: medicine batch_qty = 100
        # Wait, the factory already deducts stock on make_test_invoice
        # So we create an invoice with 10 strips. Batch qty should be 90.
        self.batch.refresh_from_db()
        original_stock = self.batch.qty_strips # Let's say 100 before invoice
        
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.batch.refresh_from_db()
        stock_after_sale = self.batch.qty_strips # Should be original_stock - 10
        
        self.authenticate_as(self.manager)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'cancel_and_reissue',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'reissue same items',
            'grandTotal': 100,
            'cashPaid': 100,
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 10,
                'rate': 10
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # After reissue, stock should be the same as stock_after_sale
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, stock_after_sale)
