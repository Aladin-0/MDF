import re

with open('apps/backend/apps/billing/tests/test_header_correction.py', 'r') as f:
    content = f.read()

# For paid invoice
replacement1 = """        # Fetch existing payload
        res = self.client.get(f'/api/v3/billing/sales/{invoice.id}/')
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        payload['revisionAction'] = 'header_correction'
        payload['revisionReasonCode'] = 'CUSTOMER_REQUEST'
        payload['revisionReasonText'] = 'corrected'
        payload['doctorId'] = str(doctor.id)"""

content = re.sub(r'        payload = \{\n            '\''customerId'\'': str\(self\.customer\.id\),\n            '\''revisionAction'\'': '\''header_correction'\'',\n            '\''revisionReasonCode'\'': '\''CUSTOMER_REQUEST'\'',\n            '\''revisionReasonText'\'': '\''corrected'\'',\n            '\''items'\'': \[\{\n                '\''id'\'': str\(invoice\.items\.first\(\)\.id\),\n                '\''batchId'\'': str\(self\.batch\.id\),\n                '\''productId'\'': str\(self\.batch\.product\.id\),\n                '\''qtyStrips'\'': 5,\n                '\''qtyLoose'\'': 0,\n                '\''rate'\'': 10,\n                '\''totalAmount'\'': 50,\n                '\''discountPct'\'': 0,\n            \}\],\n            '\''grandTotal'\'': 50,\n            '\''cashPaid'\'': 50,\n            '\''doctorId'\'': str\(doctor\.id\),\n        \}', replacement1, content)

# For unpaid invoice
replacement2 = """        # Fetch existing payload
        res = self.client.get(f'/api/v3/billing/sales/{invoice.id}/')
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        payload['revisionAction'] = 'header_correction'
        payload['revisionReasonCode'] = 'CUSTOMER_REQUEST'
        payload['revisionReasonText'] = 'try to change total'
        payload['grandTotal'] = 100
        payload['cashPaid'] = 100"""

content = re.sub(r'        payload = \{\n            '\''customerId'\'': str\(self\.customer\.id\),\n            '\''revisionAction'\'': '\''header_correction'\'',\n            '\''revisionReasonCode'\'': '\''CUSTOMER_REQUEST'\'',\n            '\''revisionReasonText'\'': '\''try to change total'\'',\n            '\''grandTotal'\'': 100,\n            '\''cashPaid'\'': 100,\n            '\''items'\'': \[\{\n                '\''productId'\'': str\(self\.medicine\.id\),\n                '\''batchId'\'': str\(self\.batch\.id\),\n                '\''productName'\'': self\.medicine\.name,\n                '\''batchNo'\'': self\.batch\.batch_no,\n                '\''qtyStrips'\'': 10,\n                '\''rate'\'': 10\n            \}\]\n        \}', replacement2, content)

with open('apps/backend/apps/billing/tests/test_header_correction.py', 'w') as f:
    f.write(content)
