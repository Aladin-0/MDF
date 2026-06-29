from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice

class RevisionPermissionsTestCase(BaseRevisionTestCase):

    def test_readonly_user_cannot_modify(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.readonly_user)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test readonly',
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
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_billing_staff_allowed_actions(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.billing_staff)
        url = reverse('sale-modification-options', kwargs={'sale_id': invoice.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        allowed_actions = response.data.get('allowedActions', [])
        
        self.assertIn('commercial_correction', allowed_actions)
        self.assertIn('header_correction', allowed_actions)
        self.assertNotIn('paid_bill_correction', allowed_actions)
        self.assertNotIn('cancel_and_reissue', allowed_actions)

    def test_manager_actions_on_paid_invoice(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=50
        )
        
        self.authenticate_as(self.manager)
        url = reverse('sale-modification-options', kwargs={'sale_id': invoice.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        allowed_actions = response.data.get('allowedActions', [])
        
        self.assertIn('paid_bill_correction', allowed_actions)
        self.assertIn('header_correction', allowed_actions)
        self.assertIn('cancel_and_reissue', allowed_actions)
        self.assertNotIn('commercial_correction', allowed_actions) # paid invoice

    def test_backend_enforces_permission_regardless_of_frontend(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=50
        )
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'paid_bill_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test enforcement',
            'grandTotal': 40,
            'cashPaid': 40
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        # Should be blocked because billing_staff lacks can_modify_paid_bill
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
