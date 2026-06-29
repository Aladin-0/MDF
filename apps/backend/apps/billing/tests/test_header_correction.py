from rest_framework import status
from django.urls import reverse
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.tests.factories import make_test_invoice
from apps.billing.models import BillRevision, LedgerEntry
from apps.accounts.models import Doctor

class HeaderCorrectionTestCase(BaseRevisionTestCase):

    def test_header_correction_on_paid_invoice(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=50
        )
        
        doctor = Doctor.objects.create(name='Dr. Sharma', outlet=self.outlet)
        
        journal_count_before = LedgerEntry.objects.count()
        self.batch.refresh_from_db()
        batch_qty_before = self.batch.qty_strips

        self.authenticate_as(self.manager) # Manager has paid invoice permission, though header_correction might bypass if it only checks header permission. Let's use manager.
        # Fetch existing payload
        res = self.client.get(reverse('sale-detail', kwargs={'sale_id': invoice.id}))
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        payload['revisionAction'] = 'header_correction'
        payload['revisionReasonCode'] = 'CUSTOMER_REQUEST'
        payload['revisionReasonText'] = 'corrected'
        payload['doctorId'] = str(doctor.id)
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.doctor.name, 'Dr. Sharma')
        self.assertEqual(invoice.grand_total, 50)
        
        self.assertEqual(LedgerEntry.objects.count(), journal_count_before)
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, batch_qty_before)
        
        revision = BillRevision.objects.filter(original_invoice=invoice).first()
        self.assertIsNotNone(revision)
        self.assertEqual(revision.revision_type, 'header_correction')
        self.assertIn('doctor_id', str(revision.diff_summary_json))

    def test_header_correction_cannot_change_total(self):
        invoice = make_test_invoice(
            self.outlet, self.billing_staff, self.customer,
            items=[{'batch': self.batch, 'qty': 5, 'rate': 10}],
            status='finalized', paid=0
        )
        
        grand_total_before = invoice.grand_total

        self.authenticate_as(self.billing_staff)
        # Fetch existing payload
        res = self.client.get(reverse('sale-detail', kwargs={'sale_id': invoice.id}))
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        payload['revisionAction'] = 'header_correction'
        payload['revisionReasonCode'] = 'CUSTOMER_REQUEST'
        payload['revisionReasonText'] = 'try to change total'
        payload['grandTotal'] = 100
        payload['cashPaid'] = 100
        payload['items'][0]['qtyStrips'] = 10
        payload['items'][0]['rate'] = 10
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, grand_total_before) # Unchanged
        self.assertEqual(invoice.items.first().qty_strips, 5) # Unchanged
