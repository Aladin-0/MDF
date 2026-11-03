from decimal import Decimal
from django.db import migrations


def activate_tax_slabs(apps, schema_editor):
    TaxSlab = apps.get_model('core', 'TaxSlab')
    TaxSlab.objects.filter(rate__in=[Decimal('12.00'), Decimal('28.00')]).update(
        is_active=True,
        effective_to=None
    )


def reverse_tax_slabs(apps, schema_editor):
    TaxSlab = apps.get_model('core', 'TaxSlab')
    TaxSlab.objects.filter(rate__in=[Decimal('12.00'), Decimal('28.00')]).update(
        is_active=False
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_taxslab'),
    ]

    operations = [
        migrations.RunPython(activate_tax_slabs, reverse_tax_slabs),
    ]
