import re

paths = [
    "apps/backend/apps/audit/tests/test_signals.py",
    "apps/backend/apps/audit/tests/test_billing_revision.py"
]

for path in paths:
    with open(path, "r") as f:
        content = f.read()
    
    content = content.replace(
        'grand_total=Decimal("100.00"),',
        'grand_total=Decimal("100.00"),\n            subtotal=Decimal("100.00"),'
    )
    
    with open(path, "w") as f:
        f.write(content)

