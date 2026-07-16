import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Staff
for staff in Staff.objects.filter(role__in=['admin', 'super_admin', 'organization_admin']):
    print(f"Phone: {staff.phone}, Role: {staff.role}, Name: {staff.name}")
