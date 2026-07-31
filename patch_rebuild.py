import re

with open('apps/backend/apps/inventory/services.py', 'r') as f:
    content = f.read()

# Replace REBUILDABLE with TABLET_REBUILDABLE
content = content.replace("'REBUILDABLE'", "'TABLET_REBUILDABLE'")

with open('apps/backend/apps/inventory/services.py', 'w') as f:
    f.write(content)
