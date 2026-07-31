from decimal import Decimal
from apps.core.models import Outlet
from apps.inventory.models import MasterProduct, Batch

outlet = Outlet.objects.first()
if not outlet:
    outlet = Outlet.objects.create(name="Test Outlet", db_name="test_db")

product = MasterProduct.objects.filter(name="Test Val Prod").first()
if not product:
    product = MasterProduct.objects.create(name="Test Val Prod", mrp=Decimal('100.00'), pack_size=10, pack_type='Strip')

Batch.objects.filter(product=product).delete()

batch = Batch.objects.create(
    outlet=outlet,
    product=product,
    batch_no="VAL-101",
    mrp=Decimal('100.00'),
    sale_rate=Decimal('90.00'),
    purchase_rate=Decimal('80.00'),
    qty_strips=10,
    qty_loose=0,
    expiry_date="2027-01-01",
    is_active=True
)

qty = Decimal(str(batch.qty_strips)) + (Decimal(str(batch.qty_loose)) / Decimal(str(batch.pack_size or 1)))

old_rate = batch.sale_rate
old_stock_value = qty * old_rate

new_rate = batch.mrp  # because it now defaults to mrp
new_stock_value = qty * new_rate

print("Batch Qty: " + str(qty))
print("Old stock value (sale_rate=90): " + str(old_stock_value))
print("New stock value (mrp=100): " + str(new_stock_value))
if old_stock_value != new_stock_value:
    print("Difference detected. This is expected because sale_rate != mrp.")
