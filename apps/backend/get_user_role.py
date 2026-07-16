import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Staff
staff = Staff.objects.filter(phone='9876543210').first()
if staff:
    print(f"Role: {staff.role}")
    print(f"can_correct_header_fields: {staff.can_correct_header_fields}")
else:
    print("Staff not found!")
