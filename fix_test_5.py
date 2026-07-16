import re

paths = [
    "apps/backend/apps/audit/tests/test_signals.py",
    "apps/backend/apps/audit/tests/test_billing_revision.py"
]

for path in paths:
    with open(path, "r") as f:
        content = f.read()
    
    if "from django.utils import timezone" not in content:
        content = "from django.utils import timezone\n" + content

    content = content.replace(
        'amount_paid=Decimal("0.00"),',
        'amount_paid=Decimal("0.00"),\n            invoice_date=timezone.now().date(),'
    )
    
    with open(path, "w") as f:
        f.write(content)

