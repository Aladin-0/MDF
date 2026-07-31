import re

with open('apps/backend/apps/billing/payment_services.py', 'r') as f:
    content = f.read()

# Replace REBUILDABLE with TABLET_REBUILDABLE globally
content = content.replace("'REBUILDABLE'", "'TABLET_REBUILDABLE'")

with open('apps/backend/apps/billing/payment_services.py', 'w') as f:
    f.write(content)
