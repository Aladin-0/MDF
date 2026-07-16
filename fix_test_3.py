import re

# Fix test_signals.py PurchaseInvoice distributor
path = "apps/backend/apps/audit/tests/test_signals.py"
with open(path, "r") as f:
    content = f.read()

# Make sure to import Distributor
if 'from apps.purchases.models import PurchaseInvoice, Distributor' not in content:
    content = content.replace(
        'from apps.purchases.models import PurchaseInvoice',
        'from apps.purchases.models import PurchaseInvoice, Distributor'
    )

content = content.replace(
    'invoice = PurchaseInvoice.objects.create(\n            outlet=self.outlet,\n            invoice_no="PINV-001",',
    'distributor = Distributor.objects.create(name="Dist", outlet=self.outlet, phone="123")\n        invoice = PurchaseInvoice.objects.create(\n            outlet=self.outlet,\n            distributor=distributor,\n            invoice_no="PINV-001",'
)
content = content.replace(
    'invoice = PurchaseInvoice.objects.create(\n            outlet=self.outlet,\n            invoice_no="PINV-002",',
    'distributor = Distributor.objects.create(name="Dist", outlet=self.outlet, phone="123")\n        invoice = PurchaseInvoice.objects.create(\n            outlet=self.outlet,\n            distributor=distributor,\n            invoice_no="PINV-002",'
)

with open(path, "w") as f:
    f.write(content)

# Fix test_changes_diff.py gst_rate
path = "apps/backend/apps/audit/tests/test_changes_diff.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace('product.tax_rate', 'product.gst_rate')
content = content.replace('"tax_rate"', '"gst_rate"')

with open(path, "w") as f:
    f.write(content)
