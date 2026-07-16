import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
django.setup()

from apps.accounts.models import Staff
count = Staff.objects.filter(role='admin').update(
    can_modify_paid_bill=True,
    can_modify_unpaid_bill=True,
    can_view_bill_revision_history=True,
    can_correct_header_fields=True,
    can_correct_rates_discounts=True,
    can_correct_quantities=True,
    can_correct_customer=True,
    can_edit_sales=True
)
print(f"Updated {count} admins")
