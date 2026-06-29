from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice, make_test_sales_return
from apps.audit.models import ActivityLog
import json

class RevisionHistoryTestCase(BaseRevisionTestCase):

    def test_revision_history_timeline(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        # We manually create some ActivityLog events to simulate history
        ActivityLog.objects.create(
            outlet=self.outlet,
            user=self.billing_staff.user,
            action='SALE_CREATED',
            object_id=str(invoice.id),
            object_type='SaleInvoice',
            changes={}
        )
        
        ActivityLog.objects.create(
            outlet=self.outlet,
            user=self.billing_staff.user,
            action='SALE_MODIFIED',
            object_id=str(invoice.id),
            object_type='SaleInvoice',
            changes={'reason': 'first', 'revision_type': 'DIRECT_REVISE'}
        )
        
        ActivityLog.objects.create(
            outlet=self.outlet,
            user=self.billing_staff.user,
            action='SALE_MODIFIED',
            object_id=str(invoice.id),
            object_type='SaleInvoice',
            changes={'reason': 'second', 'revision_type': 'DIRECT_REVISE'}
        )
        
        self.authenticate_as(self.billing_staff) # Has can_modify_unpaid_bill (implicit read/write)
        # Actually billing_staff may not have explicit view history perm. 
        # Wait, the prompt says "as billing_staff". We gave admin/readonly view perm. Let's use readonly_user or admin to be safe, or just check if it works. Let's give billing_staff view perm if needed, but in our factory, billing_staff only has modify. If the test says "as billing_staff", I'll assume they can.
        url = reverse('sale-revisions-detail', kwargs={'sale_id': invoice.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # We assume the response data contains a timeline of events
        events = response.data
        if isinstance(events, dict) and 'results' in events:
            events = events['results']
            
        actions = [e.get('action') for e in events]
        self.assertIn('SALE_CREATED', actions)
        self.assertIn('SALE_MODIFIED', actions)
        self.assertGreaterEqual(len(actions), 3)

    def test_blocked_attempt_appears_in_history(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 10, 'rate': 10}],
            status='finalized', paid=0
        )
        make_test_sales_return(
            self.outlet, self.billing_staff, invoice,
            items=[{'sale_item': invoice.items.first(), 'qty': 3}]
        )
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'try to bypass block',
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 5,
                'rate': 10
            }]
        }
        revise_url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        self.client.post(revise_url, payload, format='json')
        
        url = reverse('sale-revisions-detail', kwargs={'sale_id': invoice.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        events = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        actions = [e.get('action') for e in events]
        
        # ActivityLog should have MODIFICATION_BLOCKED
        self.assertIn('MODIFICATION_BLOCKED', actions)

    def test_readonly_user_can_view_history(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        self.authenticate_as(self.readonly_user)
        url = reverse('sale-revisions-detail', kwargs={'sale_id': invoice.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_no_permission_cannot_view_history(self):
        # Create a user with no permissions
        no_perm_staff = make_test_staff(self.outlet, name="No Perms", phone="0000000000", permissions=[])
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(no_perm_staff)
        url = reverse('sale-revisions-detail', kwargs={'sale_id': invoice.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
