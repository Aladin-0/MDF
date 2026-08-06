from apps.inventory.models import MasterProduct
prod = MasterProduct.objects.filter(name__icontains="Hand Strap").first()
if prod:
    print(f"Product: {prod.name}, Pack Type: {prod.pack_type}")
else:
    print("Not found")
