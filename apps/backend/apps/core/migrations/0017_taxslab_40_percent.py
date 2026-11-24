from decimal import Decimal

from django.db import migrations, models


def add_40_percent(apps, schema_editor):
    """
    40% is a standard GST rate now (aerated / caffeinated / energy drinks and similar goods). The table only feeds
    pick-lists and lets the journals recognise a rate (see TaxSlab): products at 40% already exist in stock.
    """
    TaxSlab = apps.get_model('core', 'TaxSlab')
    TaxSlab.objects.get_or_create(
        rate=Decimal('40.00'),
        defaults={'is_active': True, 'description': 'Special rate: energy / aerated drinks and similar goods'},
    )


def remove_40_percent(apps, schema_editor):
    apps.get_model('core', 'TaxSlab').objects.filter(rate=Decimal('40.00')).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_po_lifecycle'),
    ]

    operations = [
        migrations.RunPython(add_40_percent, remove_40_percent),
        # wording only (no database change): the table is a list of rates, not a permission
        migrations.AlterField(
            model_name='taxslab',
            name='is_active',
            field=models.BooleanField(default=True, help_text='Shown first in pick-lists. Not a permission: an inactive rate can still be sold and saved.'),
        ),
        migrations.AlterField(
            model_name='taxslab',
            name='rate',
            field=models.DecimalField(decimal_places=2, help_text='Total GST Rate percentage, e.g. 0.00, 5.00, 12.00, 18.00, 28.00, 40.00', max_digits=5, unique=True),
        ),
    ]
