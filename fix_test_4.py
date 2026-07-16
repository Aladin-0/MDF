import re

# Fix factories.py batch_no
path = "apps/backend/apps/audit/tests/factories.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace('batch_number=batch_number,', 'batch_no=batch_number,')

with open(path, "w") as f:
    f.write(content)

# Fix test_signals.py SaleInvoice amount_paid
path = "apps/backend/apps/audit/tests/test_signals.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace(
    'invoice_no="INV-001",\n            grand_total=Decimal("100.00"),',
    'invoice_no="INV-001",\n            grand_total=Decimal("100.00"),\n            amount_paid=Decimal("0.00"),'
)
content = content.replace(
    'invoice_no="INV-002",\n            grand_total=Decimal("100.00"),',
    'invoice_no="INV-002",\n            grand_total=Decimal("100.00"),\n            amount_paid=Decimal("0.00"),'
)
content = content.replace(
    'invoice_no="INV-003",\n            grand_total=Decimal("100.00"),',
    'invoice_no="INV-003",\n            grand_total=Decimal("100.00"),\n            amount_paid=Decimal("0.00"),'
)

with open(path, "w") as f:
    f.write(content)

# Fix test_billing_revision.py SaleInvoice amount_paid
path = "apps/backend/apps/audit/tests/test_billing_revision.py"
with open(path, "r") as f:
    content = f.read()

if 'amount_paid=Decimal("0.00"),' not in content:
    content = content.replace(
        'amount_due=Decimal("100.00"),',
        'amount_due=Decimal("100.00"),\n            amount_paid=Decimal("0.00"),'
    )

with open(path, "w") as f:
    f.write(content)

# Fix test_changes_diff.py
path = "apps/backend/apps/audit/tests/test_changes_diff.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace('"12.0"', '"12.00"')

with open(path, "w") as f:
    f.write(content)

