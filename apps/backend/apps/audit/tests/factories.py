import uuid
from apps.accounts.models import Staff, Customer
from apps.core.models import Organization, Outlet
from apps.inventory.models import MasterProduct, Batch
from apps.audit.models import ActivityLog
from django.utils import timezone
from datetime import timedelta

def make_organization(name="Test Org"):
    org, _ = Organization.objects.get_or_create(
        slug=name.lower().replace(" ", "-"),
        defaults={"name": name, "plan": "pro"}
    )
    return org

def make_outlet(organization=None, name="Test Outlet"):
    if not organization:
        organization = make_organization()
    outlet, _ = Outlet.objects.get_or_create(
        name=name,
        organization=organization,
        defaults={
            "address": "123 Test St",
            "city": "Test City",
            "state": "Maharashtra",
            "pincode": "400001",
            "gstin": "27AADCB2230M1Z2",
            "drug_license_no": "DL-12345",
            "phone": "9876543210"
        }
    )
    return outlet

def make_staff(phone="9999999999", pin="1234", outlet=None, **kwargs):
    if not outlet:
        outlet = make_outlet()
    name = kwargs.pop("name", "Test Staff")
    
    from django.contrib.auth.hashers import make_password
    
    kwargs.setdefault("role", "admin")
    
    try:
        staff = Staff.objects.get(phone=phone)
        return staff
    except Staff.DoesNotExist:
        staff = Staff.objects.create_user(
            phone=phone,
            password=pin,
            name=name,
            outlet=outlet,
            staff_pin=make_password(pin),
            **kwargs
        )
        return staff

def make_product(name="Paracetamol 500mg", outlet=None):
    if not outlet:
        outlet = make_outlet()
    product, _ = MasterProduct.objects.get_or_create(
        name=name,
        defaults={
            "drug_type": "allopathy",
                        "hsn_code": "3004",
            "gst_rate": 12.0, "pack_size": 10
        }
    )
    return product

def make_batch(product, batch_number="B123", qty_strips=50, expiry=None, outlet=None):
    if not expiry:
        expiry = timezone.now().date() + timedelta(days=365)
    batch, _ = Batch.objects.get_or_create(
        product=product,
        batch_no=batch_number,
        defaults={
            "outlet": outlet if "outlet" in locals() and outlet else make_outlet(),
            "expiry_date": expiry,
            "mrp": 100.0,
            "purchase_rate": 80.0,
            "sale_rate": 100.0,
            "qty_strips": qty_strips,
            "qty_loose": 0
        }
    )
    return batch

def get_latest_log(action=None, module=None, entity_type=None):
    qs = ActivityLog.objects.all()
    if action:
        qs = qs.filter(action=action)
    if module:
        qs = qs.filter(module=module)
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    return qs.order_by("-timestamp").first()

def count_logs(**filters):
    return ActivityLog.objects.filter(**filters).count()
