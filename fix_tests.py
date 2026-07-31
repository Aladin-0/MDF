import os

path1 = '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_measured_quantity.py'
with open(path1, 'r') as f:
    c = f.read()
# Add outlet=self.outlet back to Staff, Distributor, LedgerGroup, Ledger, MasterProduct where needed.
c = c.replace('role="admin",', 'role="admin", outlet=self.outlet,')
c = c.replace('pack_unit="bottle",', 'pack_unit="bottle", outlet=self.outlet,')
with open(path1, 'w') as f:
    f.write(c)

path2 = '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_edit_migration.py'
with open(path2, 'r') as f:
    c2 = f.read()
c2 = c2.replace('role="admin"', 'role="admin", outlet=self.outlet')
c2 = c2.replace("pack_unit='tablet'", "pack_unit='tablet', outlet=self.outlet")
with open(path2, 'w') as f:
    f.write(c2)
