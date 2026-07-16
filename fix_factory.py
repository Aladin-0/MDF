import re

path = "apps/backend/apps/audit/tests/factories.py"
with open(path, "r") as f:
    content = f.read()

# Fix make_product
content = content.replace(
    'product, _ = MasterProduct.objects.get_or_create(\n        name=name,\n        outlet=outlet,\n        defaults={',
    'product, _ = MasterProduct.objects.get_or_create(\n        name=name,\n        defaults={'
)

# In make_batch, outlet=product.outlet will fail if product has no outlet.
# MasterProduct has no outlet, so batch needs outlet passed in or we use a default.
# Batch definition:
#     batch, _ = Batch.objects.get_or_create(
#         product=product,
#         batch_number=batch_number,
#         defaults={
#             "outlet": product.outlet,
# ...

content = content.replace(
    '"outlet": product.outlet,',
    '"outlet": outlet if "outlet" in locals() and outlet else make_outlet(),'
)
# Wait, make_batch doesn't have outlet in its signature. Let's add it.
content = content.replace(
    'def make_batch(product, batch_number="B123", qty_strips=50, expiry=None):',
    'def make_batch(product, batch_number="B123", qty_strips=50, expiry=None, outlet=None):'
)

with open(path, "w") as f:
    f.write(content)
