from unittest.mock import patch
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from apps.billing.models import BillRevision
from apps.audit.models import ActivityLog
from apps.billing.tests.factories import make_test_invoice
from apps.billing.tests.test_revision_permissions import BaseRevisionTestCase

@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class DirectReviseTestCase(BaseRevisionTestCase):

    def test_direct_revise_reduces_qty(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        batch_qty_before = self.batch.qty_strips
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'Wrong quantity',
            'grandTotal': 30,
            'subtotal': 30, 'cashPaid': 30,
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 3,
                'rate': 10,
                'totalAmount': 30
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, 30)
        
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, batch_qty_before + 2) # 2 strips restored
        
        revisions = BillRevision.objects.filter(original_invoice=invoice).order_by('created_at')
        self.assertTrue(revisions.exists())
        revision = revisions.first()
        self.assertTrue(revision.revision_number.endswith('R1'))
        
        # Verify JSON
        self.assertEqual(float(revision.old_snapshot_json.get('grand_total')), 50.0)
        self.assertEqual(float(revision.new_snapshot_json.get('grand_total')), 30.0)
        self.assertEqual(revision.modified_by, self.billing_staff)
        self.assertEqual(revision.reason_text, 'Wrong quantity')
        
        # Check ActivityLog
        print(ActivityLog.objects.all().values("action", "entity_id"))
        self.assertTrue(ActivityLog.objects.filter(
            action='SALE_MODIFIED', 
            entity_id=str(invoice.id)
        ).exists())

    def test_reason_required_for_revise(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            # reason omitted
            'grandTotal': 40,
            'subtotal': 40, 'paymentMode': 'credit', 'creditGiven': 40,
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 4,
                'rate': 10,
                'totalAmount': 40
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.core.permissions.has_bill_revision_permission', return_value=True)
    def test_second_revision_creates_r2(self, mock_perm):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        self.authenticate_as(self.billing_staff)
        
        self.authenticate_as(self.billing_staff)
        
        # R1
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'test',
            'grandTotal': 40,
            'subtotal': 40, 'cashPaid': 40, 'paymentMode': 'cash',
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': self.medicine.name,
                'batchNo': self.batch.batch_no,
                'qtyStrips': 4,
                'rate': 10,
                'totalAmount': 40
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        # R2
        payload['revisionAction'] = 'paid_bill_correction'
        payload['items'][0]['qtyStrips'] = 3
        payload['items'][0]['totalAmount'] = 30
        payload['grandTotal'] = 30
        payload['subtotal'] = 30
        payload['cashPaid'] = 30
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        self.assertEqual(BillRevision.objects.filter(original_invoice=invoice).count(), 2)
        r2 = BillRevision.objects.filter(original_invoice=invoice).order_by('-revision_number').first()
        self.assertTrue(r2.revision_number.endswith('R2'))
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, 30)

    def test_add_item_in_direct_revise(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        from apps.billing.tests.factories import make_test_medicine
        product2, batch2 = make_test_medicine(self.outlet, "Crocin", 5, 5, 100)
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'DOCTOR_CHANGED_PRESCRIPTION',
            'revisionReasonText': 'test',
            'grandTotal': 60,
            'subtotal': 60, 'cashPaid': 60,
            'items': [
                {
                    'productId': str(self.medicine.id),
                    'batchId': str(self.batch.id),
                    'productName': self.medicine.name,
                    'batchNo': self.batch.batch_no,
                    'qtyStrips': 5,
                    'rate': 10,
                    'totalAmount': 50
                },
                {
                    'productId': str(product2.id),
                    'batchId': str(batch2.id),
                    'productName': product2.name,
                    'batchNo': batch2.batch_no,
                    'qtyStrips': 2,
                    'rate': 5,
                    'totalAmount': 10
                }
            ]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.items.count(), 2)
        self.assertEqual(invoice.grand_total, 60)

    def test_remove_item_in_direct_revise(self):
        from apps.billing.tests.factories import make_test_medicine
        product2, batch2 = make_test_medicine(self.outlet, "Crocin", 5, 5, 100)
        
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[
                {'batch': self.batch, 'qty': 5, 'rate': 10},
                {'batch': batch2, 'qty': 2, 'rate': 10}
            ],
            status='finalized', paid=0
        )
        
        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'DOCTOR_CHANGED_PRESCRIPTION',
            'revisionReasonText': 'test',
            'grandTotal': 50,
            'subtotal': 50, 'cashPaid': 50,
            'items': [
                {
                    'productId': str(self.medicine.id),
                    'batchId': str(self.batch.id),
                    'productName': self.medicine.name,
                    'batchNo': self.batch.batch_no,
                    'qtyStrips': 5,
                    'rate': 10,
                    'totalAmount': 50
                }
            ]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.items.count(), 1)
        self.assertEqual(invoice.grand_total, 50)
