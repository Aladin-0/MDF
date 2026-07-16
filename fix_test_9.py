import re

path = "apps/backend/apps/audit/tests/factories.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace(
    '"mrp": 100.0,\n            "purchase_rate": 80.0,',
    '"mrp": 100.0,\n            "purchase_rate": 80.0,\n            "sale_rate": 100.0,'
)

with open(path, "w") as f:
    f.write(content)

