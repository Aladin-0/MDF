from django.urls import reverse
from rest_framework import status
from apps.billing.tests.factories import make_test_invoice
from apps.billing.tests.test_revision_permissions import BaseRevisionTestCase
from django.test import override_settings

@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class EmptyItemsValidationTestCase(BaseRevisionTestCase):

    def test_create_sale_with_empty_items_returns_400(self):
        self.authenticate_as(self.billing_staff)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'subtotal': 0,
            'grandTotal': 0,
            'cashPaid': 0,
            'paymentMode': 'cash',
            'items': []
        }
        url = reverse('sale-list-create')
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Invoice must contain at least one item.')

    def test_create_sale_with_no_items_key_returns_400(self):
        self.authenticate_as(self.billing_staff)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'subtotal': 0,
            'grandTotal': 0,
            'cashPaid': 0,
            'paymentMode': 'cash'
        }
        url = reverse('sale-list-create')
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Invoice must contain at least one item.')

    def test_revise_sale_with_empty_items_returns_400(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'Remove items test',
            'grandTotal': 0,
            'subtotal': 0, 'cashPaid': 0,
            'items': []
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Invoice must contain at least one item.')

    def test_revise_sale_with_no_items_key_returns_400(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'outletId': str(self.outlet.id),
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'Remove items test',
            'grandTotal': 0,
            'subtotal': 0, 'cashPaid': 0
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('detail'), 'Invoice must contain at least one item.')
