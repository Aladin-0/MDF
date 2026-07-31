import re

with open('apps/backend/apps/billing/sale_return_update_service.py', 'r') as f:
    content = f.read()

# Replace REBUILDABLE with TABLET_REBUILDABLE globally
content = content.replace("'REBUILDABLE'", "'TABLET_REBUILDABLE'")

with open('apps/backend/apps/billing/sale_return_update_service.py', 'w') as f:
    f.write(content)
