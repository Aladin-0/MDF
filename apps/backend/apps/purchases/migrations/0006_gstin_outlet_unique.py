from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0005_purchaseinvoice_ledger_note'),
    ]

    operations = [
        # 1. Remove the old global unique constraint on gstin
        migrations.AlterField(
            model_name='distributor',
            name='gstin',
            field=models.CharField(max_length=15, null=True, blank=True),
        ),
        # 2. Add per-outlet uniqueness: same GSTIN allowed across outlets,
        #    but cannot appear twice within the same outlet.
        migrations.AlterUniqueTogether(
            name='distributor',
            unique_together={('outlet', 'gstin')},
        ),
    ]
