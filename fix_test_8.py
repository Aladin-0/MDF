import re

path = "apps/backend/apps/audit/tests/factories.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace(
    '"mrp": Decimal("100.00"),\n            "purchase_rate": Decimal("80.00"),',
    '"mrp": Decimal("100.00"),\n            "purchase_rate": Decimal("80.00"),\n            "sale_rate": Decimal("100.00"),'
)

with open(path, "w") as f:
    f.write(content)

