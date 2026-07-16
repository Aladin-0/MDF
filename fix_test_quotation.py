import re

with open('apps/backend/apps/billing/tests/test_quotation_api.py', 'r') as f:
    content = f.read()

new_test = """
    def test_convert_quotation_with_schedule_h(self):
        from apps.inventory.models import MasterProduct, Batch
        from apps.billing.models import ScheduleHRegister
        from accounts.models import Doctor

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
"""

content = content.replace("    def test_cannot_edit_converted_quotation(self):", new_test + "\n    def test_cannot_edit_converted_quotation(self):")

with open('apps/backend/apps/billing/tests/test_quotation_api.py', 'w') as f:
    f.write(content)
