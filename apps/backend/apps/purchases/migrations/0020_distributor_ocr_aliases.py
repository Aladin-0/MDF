from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('purchases', '0019_po_normalise_old_statuses')]

    operations = [
        migrations.AddField(
            model_name='distributor',
            name='ocr_aliases',
            field=models.JSONField(blank=True, default=dict,
                                   help_text='Names / GSTINs learned from confirmed invoice scans'),
        ),
    ]
