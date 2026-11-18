import uuid
from apps.accounts.models import Staff, Customer
from apps.core.models import Organization, Outlet
from apps.inventory.models import MasterProduct, Batch
from apps.audit.models import ActivityEvent, ActivityLog
from django.utils import timezone
from datetime import timedelta

def make_organization(name='Test Org'):
    org, _ = Organization.objects.get_or_create(slug=name.lower().replace(' ', '-'), defaults={'name': name, 'plan': 'pro'})
    return org

def make_outlet(organization=None, name='Test Outlet'):
    if not organization:
        organization = make_organization()
    outlet, _ = Outlet.objects.get_or_create(name=name, organization=organization, defaults={'address': '123 Test St', 'city': 'Test City', 'state': 'Maharashtra', 'pincode': '400001', 'gstin': '27AADCB2230M1Z2', 'drug_license_no': 'DL-12345', 'phone': '9876543210'})
    return outlet

def make_staff(phone='9999999999', pin='1234', outlet=None, **kwargs):
    if not outlet:
        outlet = make_outlet()
    name = kwargs.pop('name', 'Test Staff')
    from django.contrib.auth.hashers import make_password
    kwargs.setdefault('role', 'admin')
    try:
        staff = Staff.objects.get(phone=phone)
        return staff
    except Staff.DoesNotExist:
        staff = Staff.objects.create_user(phone=phone, password=pin, name=name, outlet=outlet, staff_pin=make_password(pin), **kwargs)
        return staff

def make_product(name='Paracetamol 500mg', outlet=None):
    if not outlet:
        outlet = make_outlet()
    product, _ = MasterProduct.objects.get_or_create(name=name, defaults={'drug_type': 'allopathy', 'hsn_code': '3004', 'gst_rate': 12.0, 'pack_size': 10})
    return product

def make_batch(product, batch_number='B123', qty_strips=50, expiry=None, outlet=None):
    if not expiry:
        expiry = timezone.now().date() + timedelta(days=365)
    batch, _ = Batch.objects.create(product=product, batch_no=batch_number, defaults={'outlet': outlet if 'outlet' in locals() and outlet else make_outlet(), 'expiry_date': expiry, 'mrp': 100.0, 'purchase_rate': 80.0, 'sale_rate': 100.0, 'qty_strips': qty_strips, 'qty_loose': 0})
    return batch

class LegacyLog:
    """An ActivityEvent seen with the attribute names the old ActivityLog had, so the older tests keep testing behaviour, not the table."""

    def __init__(self, ev):
        self._ev = ev

    def __getattr__(self, name):
        ev = self.__dict__['_ev']
        if name == 'user':
            from apps.accounts.models import Staff
            return Staff.objects.filter(pk=ev.actor_id).first() if ev.actor_id else None
        if name == 'timestamp':
            return ev.occurred_at
        if name == 'description':
            return ev.metadata_json.get('description') or ev.summary
        if name == 'http_method':
            return ev.metadata_json.get('method', '')
        if name == 'endpoint':
            return ev.metadata_json.get('endpoint', '')
        if name == 'changes_json':
            return {c['field']: {'old': c.get('before'), 'new': c.get('after')} for c in (ev.changes_json or [])}
        return getattr(ev, name)


def _events(action=None, module=None, entity_type=None, **filters):
    qs = ActivityEvent.objects.all()
    if action:
        qs = qs.filter(action=action)
    if module:
        qs = qs.filter(module=module)
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    return qs.filter(**filters) if filters else qs


def get_latest_log(action=None, module=None, entity_type=None):
    ev = _events(action, module, entity_type).order_by('-occurred_at').first()
    return LegacyLog(ev) if ev else None


def count_logs(**filters):
    return _events(**filters).count()


def allow_history_rewrite():
    """The audit table refuses UPDATE / DELETE of events (a database trigger). A test that needs to back-date an event lifts that for its own transaction."""
    from django.db import connection
    with connection.cursor() as c:
        c.execute("SET LOCAL audit.allow_purge = 'on'")
