import uuid
from decimal import Decimal
from datetime import date
from django.db import migrations, models


def seed_default_tax_slabs(apps, schema_editor):
    TaxSlab = apps.get_model('core', 'TaxSlab')
    default_slabs = [
        {"rate": Decimal('0.00'), "is_active": True, "description": "Exempt / Nil-Rated"},
        {"rate": Decimal('5.00'), "is_active": True, "description": "Essential Goods (GST 2.0)"},
        {"rate": Decimal('12.00'), "is_active": False, "description": "Legacy 12% (Abolished Sept 2025)", "effective_to": date(2025, 8, 31)},
        {"rate": Decimal('18.00'), "is_active": True, "description": "Standard Rate (GST 2.0)"},
        {"rate": Decimal('28.00'), "is_active": False, "description": "Legacy 28% (Abolished Sept 2025)", "effective_to": date(2025, 8, 31)},
    ]
    for s in default_slabs:
        TaxSlab.objects.get_or_create(rate=s["rate"], defaults=s)


def reverse_tax_slabs(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_merge_20261009_1336'),
    ]

    operations = [
        migrations.CreateModel(
            name='TaxSlab',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('rate', models.DecimalField(decimal_places=2, help_text='Total GST Rate percentage, e.g. 0.00, 5.00, 12.00, 18.00, 28.00', max_digits=5, unique=True)),
                ('description', models.CharField(blank=True, max_length=120)),
                ('is_active', models.BooleanField(default=True, help_text='Whether this rate is active for new transactions under current GST regime')),
                ('effective_from', models.DateField(blank=True, help_text='Effective start date', null=True)),
                ('effective_to', models.DateField(blank=True, help_text='Effective end date if abolished/phased out', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'core_taxslab',
                'ordering': ['rate'],
            },
        ),
        migrations.RunPython(seed_default_tax_slabs, reverse_code=reverse_tax_slabs),
    ]
