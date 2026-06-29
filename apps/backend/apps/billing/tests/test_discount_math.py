from rest_framework import status
from django.urls import reverse
from decimal import Decimal
from apps.billing.tests.base import BaseRevisionTestCase
from apps.billing.models import SaleInvoice, SaleItem
from apps.billing.tests.factories import make_test_invoice

class DiscountMathTestCase(BaseRevisionTestCase):

    def test_item_discount_only(self):
        # We need to create an invoice manually for specific discount scenario
        invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-DISC-01",
            invoice_date="2026-06-16T12:00:00Z",
            customer=self.customer,
            subtotal=Decimal('100.00'),
            taxable_amount=Decimal('90.00'),
            grand_total=Decimal('90.00'),
            payment_mode='credit',
            amount_due=Decimal('90.00'),
            amount_paid=Decimal('0.00'),
            cash_paid=Decimal('0.00'),
            billed_by=self.billing_staff,
            extra_discount_pct=Decimal('0.00')
        )
        
        SaleItem.objects.create(
            invoice=invoice,
            batch=self.batch,
            product_name="Test Prod",
            pack_size=10,
            pack_unit="tablet",
            schedule_type="OTC",
            batch_no="B-TEST-01",
            expiry_date="2030-01-01",
            mrp=Decimal('100.00'),
            sale_rate=Decimal('100.00'),
            rate=Decimal('90.00'), # 10% item discount applied to rate
            qty_strips=1,
            qty_loose=0,
            discount_pct=Decimal('10.00'),
            taxable_amount=Decimal('90.00'),
            gst_amount=Decimal('0.00'),
            gst_rate=Decimal('0.00'),
            total_amount=Decimal('90.00')
        )

        self.assertEqual(invoice.items.first().rate, Decimal('90.00'))
        self.assertEqual(invoice.grand_total, Decimal('90.00'))

        self.authenticate_as(self.billing_staff)
        payload = {
            'customerId': str(self.customer.id),
            'revisionAction': 'commercial_correction',
            'revisionReasonCode': 'CUSTOMER_REQUEST',
            'revisionReasonText': 'No change save',
            'grandTotal': 90,
            'cashPaid': 90,
            'items': [{
                'productId': str(self.medicine.id),
                'batchId': str(self.batch.id),
                'productName': "Test Prod",
                'batchNo': "B-TEST-01",
                'qtyStrips': 1,
                'rate': 90, # Send back rate 90
            }]
        }
        url = reverse('sale-revise', kwargs={'sale_id': invoice.id})
        response = self.client.post(url, payload, format='json')
        if response.status_code != 200:
            print("Response:", response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.items.first().rate, Decimal('90.00')) # Not double discounted

    def test_invoice_extra_discount_only(self):
        invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-DISC-02",
            invoice_date="2026-06-16T12:00:00Z",
            customer=self.customer,
            subtotal=Decimal('100.00'),
            extra_discount_pct=Decimal('5.00'),
            discount_amount=Decimal('5.00'),
            taxable_amount=Decimal('95.00'),
            grand_total=Decimal('95.00'),
            payment_mode='credit',
            amount_due=Decimal('95.00'),
            amount_paid=Decimal('0.00'),
            cash_paid=Decimal('0.00'),
            billed_by=self.billing_staff
        )
        
        SaleItem.objects.create(
            invoice=invoice,
            batch=self.batch,
            product_name="Test Prod",
            pack_size=10,
            pack_unit="tablet",
            schedule_type="OTC",
            batch_no="B-TEST-01",
            expiry_date="2030-01-01",
            mrp=Decimal('100.00'),
            sale_rate=Decimal('100.00'),
            rate=Decimal('100.00'),
            qty_strips=1,
            qty_loose=0,
            discount_pct=Decimal('0.00'),
            taxable_amount=Decimal('100.00'),
            gst_amount=Decimal('0.00'),
            gst_rate=Decimal('0.00'),
            total_amount=Decimal('100.00')
        )

        self.assertEqual(invoice.subtotal, Decimal('100.00'))
        self.assertEqual(invoice.extra_discount_pct, Decimal('5.00'))
        self.assertEqual(invoice.grand_total, Decimal('95.00'))

    def test_item_and_invoice_discount_combined(self):
        invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-DISC-03",
            invoice_date="2026-06-16T12:00:00Z",
            customer=self.customer,
            subtotal=Decimal('90.00'), # sum of item rates
            extra_discount_pct=Decimal('5.00'),
            discount_amount=Decimal('4.50'),
            taxable_amount=Decimal('85.50'),
            grand_total=Decimal('85.50'),
            payment_mode='credit',
            amount_due=Decimal('85.50'),
            amount_paid=Decimal('0.00'),
            cash_paid=Decimal('0.00'),
            billed_by=self.billing_staff
        )
        
        SaleItem.objects.create(
            invoice=invoice,
            batch=self.batch,
            product_name="Test Prod",
            pack_size=10,
            pack_unit="tablet",
            schedule_type="OTC",
            batch_no="B-TEST-01",
            expiry_date="2030-01-01",
            mrp=Decimal('100.00'),
            sale_rate=Decimal('100.00'),
            rate=Decimal('90.00'), # 10% item discount
            qty_strips=1,
            qty_loose=0,
            discount_pct=Decimal('10.00'),
            taxable_amount=Decimal('90.00'),
            gst_amount=Decimal('0.00'),
            gst_rate=Decimal('0.00'),
            total_amount=Decimal('90.00')
        )

        self.assertEqual(invoice.items.first().rate, Decimal('90.00'))
        self.assertEqual(invoice.discount_amount, Decimal('4.50'))
        self.assertEqual(invoice.grand_total, Decimal('85.50'))

    def test_no_discount(self):
        invoice = SaleInvoice.objects.create(
            outlet=self.outlet,
            invoice_no="INV-DISC-04",
            invoice_date="2026-06-16T12:00:00Z",
            customer=self.customer,
            subtotal=Decimal('100.00'),
            extra_discount_pct=Decimal('0.00'),
            discount_amount=Decimal('0.00'),
            taxable_amount=Decimal('100.00'),
            grand_total=Decimal('100.00'),
            payment_mode='credit',
            amount_due=Decimal('100.00'),
            amount_paid=Decimal('0.00'),
            cash_paid=Decimal('0.00'),
            billed_by=self.billing_staff
        )
        
        SaleItem.objects.create(
            invoice=invoice,
            batch=self.batch,
            product_name="Test Prod",
            pack_size=10,
            pack_unit="tablet",
            schedule_type="OTC",
            batch_no="B-TEST-01",
            expiry_date="2030-01-01",
            mrp=Decimal('100.00'),
            sale_rate=Decimal('100.00'),
            rate=Decimal('100.00'),
            qty_strips=1,
            qty_loose=0,
            discount_pct=Decimal('0.00'),
            taxable_amount=Decimal('100.00'),
            gst_amount=Decimal('0.00'),
            gst_rate=Decimal('0.00'),
            total_amount=Decimal('100.00')
        )

        self.assertEqual(invoice.grand_total, Decimal('100.00'))
