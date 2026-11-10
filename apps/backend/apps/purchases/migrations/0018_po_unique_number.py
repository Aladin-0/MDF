from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('purchases', '0017_po_renumber_duplicates')]

    operations = [
        migrations.AddConstraint(
            model_name='purchaseorder',
            constraint=models.UniqueConstraint(fields=('outlet', 'po_number'), name='uniq_po_number_per_outlet'),
        ),
    ]
