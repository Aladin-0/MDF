from rest_framework import status
from django.urls import reverse
from decimal import Decimal
from apps.billing.models import Quotation, SaleInvoice, LedgerEntry
from apps.inventory.models import StockLedger, Batch
from apps.billing.tests.base import BaseRevisionTestCase
from apps.accounts.models import Ledger

class QuotationAPITestCase(BaseRevisionTestCase):
    def setUp(self):
        super().setUp()
        self.billing_staff.role = 'billing_staff'
        self.billing_staff.user.role = 'billing_staff'
        self.billing_staff.save()
        self.billing_staff.user.save()
        self.authenticate_as(self.billing_staff)
        self.quotation_url = reverse('quotation-list-create')

    def test_create_quotation_success(self):
        # CASE A: Quotation creation (no stock deduction, no ledger entries)
        initial_stock = Batch.objects.get(id=self.batch.id).qty_strips
        
        payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [
                {
                    "batch": str(self.batch.id),
                    "qty_strips": 1,
                    "rate": "90.00"
                }
            ]
        }
        
        response = self.client.post(self.quotation_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        
        quotation_id = response.data['id']
        quotation = Quotation.objects.get(id=quotation_id)
        
        # Verify quotation number
        self.assertTrue(quotation.quotation_no.startswith('QT-'))
        self.assertEqual(quotation.outlet.id, self.outlet.id)
        self.assertEqual(quotation.status, 'saved')
        
        # Verify NO stock deduction
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, initial_stock)
        
        # Verify NO stock ledger entries
        self.assertFalse(StockLedger.objects.filter(voucher_number=quotation.quotation_no).exists())
        
        # Verify NO accounting ledger entries
        self.assertFalse(LedgerEntry.objects.filter(reference_no=quotation.quotation_no).exists())

    def test_update_quotation(self):
        # CASE B: Update quotation
        # Create a quotation first
        payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [
                {
                    "batch": str(self.batch.id),
                    "qty_strips": 1,
                    "rate": "90.00"
                }
            ]
        }
        create_res = self.client.post(self.quotation_url, payload, format='json')
        quotation_id = create_res.data['id']
        quotation = Quotation.objects.get(id=quotation_id)
        
        # Update quantity
        update_payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "180.00",
            "grand_total": "180.00",
            "items": [
                {
                    "batch": str(self.batch.id),
                    "qty_strips": 2,
                    "rate": "90.00"
                }
            ]
        }
        detail_url = reverse('quotation-detail', kwargs={'pk': quotation_id})
        update_res = self.client.put(detail_url, update_payload, format='json')
        self.assertEqual(update_res.status_code, status.HTTP_200_OK, update_res.data)
        
        quotation.refresh_from_db()
        self.assertEqual(quotation.grand_total, Decimal('180.00'))
        self.assertEqual(quotation.items.first().qty_strips, 2)
        
        # Verify NO side effects still
        self.assertFalse(StockLedger.objects.filter(voucher_number=quotation.quotation_no).exists())

    def test_convert_quotation_to_invoice(self):
        # CASE C: Convert quotation to invoice
        initial_stock = Batch.objects.get(id=self.batch.id).qty_strips
        
        payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [
                {
                    "batch": str(self.batch.id),
                    "qty_strips": 1,
                    "rate": "90.00"
                }
            ]
        }
        create_res = self.client.post(self.quotation_url, payload, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED, create_res.data)
        quotation_id = create_res.data['id']
        quotation = Quotation.objects.get(id=quotation_id)
        
        convert_url = reverse('quotation-convert', kwargs={'pk': quotation_id})
        convert_payload = {
            "payment_mode": "cash",
            "cash_paid": "90.00",
            "amount_paid": "90.00"
        }
        convert_res = self.client.post(convert_url, convert_payload, format='json')
        
        self.assertEqual(convert_res.status_code, status.HTTP_201_CREATED, convert_res.data)
        invoice_id = convert_res.data['id']
        invoice = SaleInvoice.objects.get(id=invoice_id)
        
        # Verify Quotation state
        quotation.refresh_from_db()
        self.assertEqual(quotation.status, 'converted')
        self.assertEqual(quotation.converted_to_invoice, invoice)
        
        # Verify Invoice state
        self.assertEqual(invoice.grand_total, Decimal('90.00'))
        
        # Verify Stock deducted
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, initial_stock - 1)
        self.assertTrue(StockLedger.objects.filter(voucher_number=invoice.invoice_no).exists())
        
        # Verify Ledgers created
        self.assertTrue(LedgerEntry.objects.filter(reference_no=invoice.invoice_no).exists())
        

    def test_convert_quotation_with_schedule_h(self):
        from apps.inventory.models import MasterProduct, Batch
        from apps.billing.models import ScheduleHRegister
        from apps.accounts.models import Doctor

        # Create schedule H product
        product_h = MasterProduct.objects.create(
            name="Sched H Drug",
            drug_type='allopathy',
            schedule_type='H',
            pack_size=10,
            pack_unit='tablet',
            mrp=Decimal('100.0'),
            default_sale_rate=Decimal('90.0')
        )
        batch_h = Batch.objects.create(
            outlet=self.outlet,
            product=product_h,
            batch_no="BATCH-H-1",
            expiry_date="2030-12-31",
            pack_size=10,
            qty_strips=10,
            mrp=Decimal('100.0'),
            sale_rate=Decimal('90.0')
        )
        doctor = Doctor.objects.create(
            outlet=self.outlet,
            name="Dr. Smith",
            phone="9998887776",
            registration_no="REG123"
        )
        
        payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [
                {
                    "batch": str(batch_h.id),
                    "qty_strips": 1,
                    "rate": "90.00"
                }
            ]
        }
        create_res = self.client.post(self.quotation_url, payload, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED, create_res.data)
        quotation_id = create_res.data['id']
        
        convert_url = reverse('quotation-convert', kwargs={'pk': quotation_id})
        convert_payload = {
            "paymentMode": "cash",
            "cashPaid": "90.00",
            "amountPaid": "90.00",
            "doctorId": str(doctor.id),
            "scheduleHData": {
                "patientName": "John Doe",
                "patientAge": 45,
                "patientAddress": "123 Elm St",
                "doctorName": "Dr. Smith",
                "doctorRegNo": "REG123",
                "prescriptionNo": "RX-001"
            },
            "prescriptionNo": "RX-001"
        }
        convert_res = self.client.post(convert_url, convert_payload, format='json')
        
        self.assertEqual(convert_res.status_code, status.HTTP_201_CREATED, convert_res.data)
        invoice_id = convert_res.data['id']
        invoice = SaleInvoice.objects.get(id=invoice_id)
        
        # Verify doctorId and scheduleHData were passed correctly
        self.assertEqual(invoice.doctor_id, doctor.id)
        self.assertEqual(invoice.prescription_no, "RX-001")
        
        # Verify ScheduleHRegister was created properly
        h_reg = ScheduleHRegister.objects.get(sale_item__invoice=invoice)
        self.assertEqual(h_reg.patient_name, "John Doe")
        self.assertEqual(h_reg.doctor_name, "Dr. Smith")

    def test_cannot_edit_converted_quotation(self):
        # CASE E: Invalid edits (converted quotation cannot be edited)
        payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [{"batch": str(self.batch.id), "qty_strips": 1, "rate": "90.00"}]
        }
        create_res = self.client.post(self.quotation_url, payload, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED, create_res.data)
        quotation_id = create_res.data['id']
        
        convert_url = reverse('quotation-convert', kwargs={'pk': quotation_id})
        self.client.post(convert_url, {"payment_mode": "cash"}, format='json')
        
        # Attempt update
        detail_url = reverse('quotation-detail', kwargs={'pk': quotation_id})
        update_res = self.client.put(detail_url, payload, format='json')
        self.assertEqual(update_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_walk_in_customer_quotation(self):
        # CASE F: Walk-in customer quotation
        payload = {
            "outletId": str(self.outlet.id),
            "customer_name_override": "Walkin John",
            "customer_phone": "1234567890",
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [{"batch": str(self.batch.id), "qty_strips": 1, "rate": "90.00"}]
        }
        response = self.client.post(self.quotation_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        quotation = Quotation.objects.get(id=response.data['id'])
        self.assertEqual(quotation.customer_name_override, "Walkin John")
        
        # Convert walk-in
        convert_url = reverse('quotation-convert', kwargs={'pk': quotation.id})
        convert_res = self.client.post(convert_url, {"payment_mode": "cash"}, format='json')
        self.assertEqual(convert_res.status_code, status.HTTP_201_CREATED, convert_res.data)

    def test_create_sale_from_quotation_frontend_flow(self):
        # CASE D: The modern frontend flow (Load quote into cart, post to /sales/ with quotationId)
        initial_stock = Batch.objects.get(id=self.batch.id).qty_strips
        
        # 1. Create Quotation
        payload = {
            "outletId": str(self.outlet.id),
            "customer": str(self.customer.id),
            "subtotal": "90.00",
            "grand_total": "90.00",
            "items": [
                {
                    "batch": str(self.batch.id),
                    "qty_strips": 1,
                    "rate": "90.00"
                }
            ]
        }
        create_res = self.client.post(self.quotation_url, payload, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        quotation_id = create_res.data['id']
        
        # 2. Retrieve Quotation (simulating frontend fetching quotation details)
        detail_url = reverse('quotation-detail', kwargs={'pk': quotation_id})
        get_res = self.client.get(detail_url)
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        
        # Verify the new product field is present in the items!
        q_item = get_res.data['items'][0]
        self.assertIn('product', q_item)
        self.assertIsNotNone(q_item['product'])
        
        # 3. Submit Sale (simulating frontend Save Bill)
        sale_url = reverse('sale-list-create')
        sale_payload = {
            "outletId": str(self.outlet.id),
            "quotationId": quotation_id,
            "customerId": str(self.customer.id),
            "items": [
                {
                    "batchId": str(self.batch.id),
                    "productId": q_item['product'],
                    "qtyStrips": 1,
                    "qtyLoose": 0,
                    "rate": "90.00",
                    "discountPct": 0,
                    "gstRate": 0,
                    "taxableAmount": 90.00,
                    "gstAmount": 0,
                    "totalAmount": 90.00
                }
            ],
            "subtotal": 90.00,
            "discountAmount": 0,
            "taxableAmount": 90.00,
            "cgstAmount": 0,
            "sgstAmount": 0,
            "igstAmount": 0,
            "cgst": 0,
            "sgst": 0,
            "igst": 0,
            "cessAmount": 0,
            "roundOff": 0,
            "totalAmount": 90.00,
            "paidAmount": 90.00,
            "payments": [{"method": "cash", "amount": 90.00}]
        }
        
        sale_res = self.client.post(sale_url, sale_payload, format='json')
        self.assertEqual(sale_res.status_code, status.HTTP_201_CREATED, sale_res.data)
        
        # Verify Quotation state is converted
        quotation = Quotation.objects.get(id=quotation_id)
        self.assertEqual(quotation.status, 'converted')
        
        # Verify Stock deducted
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.qty_strips, initial_stock - 1)
