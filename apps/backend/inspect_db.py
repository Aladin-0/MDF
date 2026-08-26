import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.dev')
django.setup()

from django.conf import settings
from apps.core.models import Outlet, SandboxConfiguration, GstTaxpayerAuth
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

print("=== DATABASE INVENTORY ===")
print(f"Active settings module: {settings.SETTINGS_MODULE}")
print(f"DEBUG is: {settings.DEBUG}")

print(f"SandboxConfiguration count: {SandboxConfiguration.objects.count()}")
print(f"GstTaxpayerAuth count: {GstTaxpayerAuth.objects.count()}")

now = timezone.now()
active_sessions = GstTaxpayerAuth.objects.filter(session_expires_at__gt=now).count()
expired_sessions = GstTaxpayerAuth.objects.filter(session_expires_at__lte=now).count()
print(f"Active taxpayer sessions: {active_sessions}")
print(f"Expired taxpayer sessions: {expired_sessions}")

# Outlets
gstin_outlets = Outlet.objects.exclude(gstin='').exclude(gstin__isnull=True)
print(f"Outlets with GSTIN count: {gstin_outlets.count()}")
for o in gstin_outlets:
    print(f"Outlet: {o.name}, Masked GSTIN: {o.gstin[:2]}***{o.gstin[-2:] if len(o.gstin)>4 else ''}")

# Sandbox matches
target_gstin = os.environ.get('SANDBOX_GSTIN', '27AAPCM1753L2ZX')
matching_outlet = Outlet.objects.filter(gstin=target_gstin).first()
if matching_outlet:
    print(f"Outlet matching expected sandbox GSTIN ({target_gstin[:2]}***{target_gstin[-2:]}): {matching_outlet.name}")
    staff_count = User.objects.filter(outlet=matching_outlet).count()
    print(f"Staff users linked to {matching_outlet.name}: {staff_count}")
    for u in User.objects.filter(outlet=matching_outlet):
        phone = str(u.phone)
        masked_phone = f"{phone[:2]}***{phone[-2:]}" if len(phone) >= 4 else "***"
        print(f" - Staff: {u.name} (Phone: {masked_phone}, is_active: {u.is_active})")
else:
    print("NO outlet matches the expected sandbox GSTIN.")

# Check protected user 9999999999
protected = User.objects.filter(phone='9999999999').first()
if protected:
    outlet_name = protected.outlet.name if protected.outlet else "None"
    print(f"Protected user 9999999999 is linked to Outlet: {outlet_name}")
else:
    print("Protected user 9999999999 not found.")
