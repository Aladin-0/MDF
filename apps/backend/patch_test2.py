import re

with open('apps/billing/tests/test_sale_edit_migration.py', 'r') as f:
    content = f.read()

content = content.replace("f'/api/v1/billing/sales/{self.invoice.id}/revise/'", "reverse('sale-revise', kwargs={'sale_id': self.invoice.id})")

with open('apps/billing/tests/test_sale_edit_migration.py', 'w') as f:
    f.write(content)

