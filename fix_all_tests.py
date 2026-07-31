import os
import re

files = [
    '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_edit_migration.py',
    '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_edit_stock.py',
    '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_edit_concurrency.py',
]

for p in files:
    with open(p, 'r') as f:
        c = f.read()
    c = re.sub(r'pack_size=\d+,?', 'pack_size=10, pack_type="strip", pack_unit="tablet",', c)
    with open(p, 'w') as f:
        f.write(c)
