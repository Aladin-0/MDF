from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice, make_test_sales_return
from apps.billing.models import BillRevision
class ReturnAwareCorrectionTestCase(BaseRevisionTestCase):

    def test_return_aware_block_qty_below_returned(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_sales_return(
            self.outlet, self.billing_staff, invoice,
            items=[{'sale_item': invoice.items.first(), 'qty': 4}]
        )
        
        self.batch.refresh_from_db()
        batch_qty_before = self.batch.qty_strips

        self.authenticate_as(self.senior_billing)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'return_aware_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test qty below returned',
            'grandTotal': 20,
            'cashPaid': 20,
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 2, # Below returned 4
                'rate': 10
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('below already returned quantity', response.data.get('detail', ''))
        
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, batch_qty_before)

    def test_return_aware_allow_qty_above_returned(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_sales_return(
            self.outlet, self.billing_staff, invoice,
            items=[{'sale_item': invoice.items.first(), 'qty': 4}]
        )
        
        self.batch.refresh_from_db()
        batch_qty_before = self.batch.qty_strips

        self.authenticate_as(self.senior_billing)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'return_aware_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test qty above returned',
            'grandTotal': 50,
            'cashPaid': 50,
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 5, # Above returned 4
                'rate': 10
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.batch.refresh_from_db()
        # Original 10, return 4 (net 6 sold). New 5 sold, return 4. Net 1 sold.
        # Wait, the stock adjustment logic: diff = 5 - 10 = -5. So 5 restored.
        self.assertEqual(self.batch.qty_strips, batch_qty_before + 5)
        
        revision = BillRevision.objects.filter(original_invoice=invoice).first()
        self.assertIsNotNone(revision)

    def test_cannot_remove_item_with_existing_return(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_sales_return(
            self.outlet, self.billing_staff, invoice,
            items=[{'sale_item': invoice.items.first(), 'qty': 4}]
        )
        
        self.authenticate_as(self.senior_billing)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'return_aware_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'Remove item',
            'grandTotal': 0,
            'cashPaid': 0,
            'items': [] # Remove Amoxicillin entirely
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertIn('Cannot remove', response.data.get('detail', ''))
