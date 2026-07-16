import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.dev')
django.setup()

from apps.accounts.models import Staff
admin_staff = Staff.objects.filter(role='admin').first()
if admin_staff:
    admin_staff.can_modify_paid_bill = True
    admin_staff.can_modify_unpaid_bill = True
    admin_staff.can_view_bill_revision_history = True
    admin_staff.can_correct_header_fields = True
    admin_staff.can_correct_line_items = True
    admin_staff.can_modify_bill_amounts = True
    admin_staff.can_correct_receipt_allocations = True
    admin_staff.save()
    print("Admin permissions fixed!")
else:
    print("Admin not found!")
