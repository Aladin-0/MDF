import re

with open('apps/billing/tests/test_sale_edit_migration.py', 'r') as f:
    content = f.read()

pattern = re.compile(r"    def test_sale_success_payload_shape_parity\(self\):.*", re.DOTALL)

replacement = """    def test_sale_success_payload_shape_parity(self):
        # 1. Edit (SaleDetailView.put)
        payload = self.get_put_payload(self.invoice)
        payload['revisionAction'] = 'standard_correction'
        payload['revisionReasonCode'] = 'correction'
        payload['revisionReasonText'] = 'Fix qty'
        
        response = self.client.put(
            f'/api/v1/sales/{self.invoice.id}/',
            payload,
            format='json',
            HTTP_OUTLETID=str(self.outlet.id)
        )
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertIn('createdAt', data)
        self.assertIn('invoiceNo', data)
        self.assertIn('grandTotal', data)
        self.assertIn('paymentMode', data)
        self.assertIn('items', data)
        self.assertIn('revisionId', data)
        self.assertIn('message', data)

        # 2. Revise (SaleReviseView.post)
        payload['revisionAction'] = 'cancel_and_reissue'
        response = self.client.post(
            f'/api/v1/billing/sales/{self.invoice.id}/revise/',
            payload,
            format='json',
            HTTP_OUTLETID=str(self.outlet.id)
        )
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertIn('createdAt', data)
        self.assertIn('invoiceNo', data)
        self.assertIn('grandTotal', data)
        self.assertIn('paymentMode', data)
        self.assertIn('items', data)
        self.assertIn('revisionId', data)
        self.assertIn('message', data)
"""

content = pattern.sub(replacement, content)
with open('apps/billing/tests/test_sale_edit_migration.py', 'w') as f:
    f.write(content)

