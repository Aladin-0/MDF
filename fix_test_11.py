import re

path = "apps/backend/apps/audit/tests/test_billing_revision.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace('status="final",', '')
content = content.replace('status="draft",', '')
content = content.replace('status="cancelled",', '')

with open(path, "w") as f:
    f.write(content)

