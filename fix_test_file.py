import os

path = '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_measured_quantity.py'
with open(path, 'r') as f:
    c = f.read()

c = c.replace('name="Test Distributor",', 'name="Test Distributor", outlet=self.outlet')
c = c.replace("name='Sundry Creditors',", "name='Sundry Creditors', outlet=self.outlet,")
c = c.replace('name="Test Distributor Ledger",', 'name="Test Distributor Ledger", outlet=self.outlet,')

with open(path, 'w') as f:
    f.write(c)

path2 = '/home/asta/coding/MDF/apps/backend/apps/purchases/tests/test_purchase_edit_migration.py'
with open(path2, 'r') as f:
    c2 = f.read()

# Let's ensure outlet is there for those models in migration test too, though I think I might have only broken it if it had `outlet=self.outlet,` and was matched by my sed command.
# But wait, my sed command was `/outlet=self.outlet,/d` which deletes the WHOLE LINE. So I might have deleted `outlet=self.outlet,` entirely, leaving a syntax error or a missing attribute.
