import re

# Fix factories.py
path = "apps/backend/apps/audit/tests/factories.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace('"product_type": "medicine"', '"drug_type": "allopathy"')
content = content.replace('"unit_of_measure": "strips",\n', '')
content = content.replace('"tax_rate": 12.0', '"gst_rate": 12.0, "pack_size": 10')

with open(path, "w") as f:
    f.write(content)

# Fix test_signals.py PurchaseInvoice taxable_amount
path = "apps/backend/apps/audit/tests/test_signals.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace(
    'subtotal=Decimal("500.00"),',
    'subtotal=Decimal("500.00"),\n            taxable_amount=Decimal("500.00"),'
)

with open(path, "w") as f:
    f.write(content)
