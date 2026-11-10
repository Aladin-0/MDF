from django.db import migrations


def grant(apps, schema_editor):
    """
    can_correct_quantities / can_correct_customer / can_correct_rates_discounts are now ENFORCED when a bill is edited.
    Until now nothing checked them, so every user who could edit bills could change all three. Give those
    users the rights they already effectively had, so turning enforcement on locks nobody out; an admin can then
    narrow them per person in Staff -> Edit.
    """
    Staff = apps.get_model('accounts', 'Staff')
    editors = (
        Staff.objects.filter(can_modify_draft_bill=True)
        | Staff.objects.filter(can_modify_unpaid_bill=True)
        | Staff.objects.filter(can_modify_paid_bill=True)
        | Staff.objects.filter(can_modify_bill_with_return=True)
        | Staff.objects.filter(can_correct_header_fields=True)
        | Staff.objects.filter(can_edit_sales=True)
    )
    editors.update(can_correct_quantities=True, can_correct_customer=True)
    Staff.objects.filter(pk__in=editors.values('pk'), can_edit_rate=True).update(can_correct_rates_discounts=True)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0027_journalline_description')]
    operations = [migrations.RunPython(grant, migrations.RunPython.noop)]
