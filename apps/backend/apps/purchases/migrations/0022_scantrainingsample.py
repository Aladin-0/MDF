import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0001_initial'),
        ('purchases', '0021_purchaseinvoicepage'),
    ]

    operations = [
        migrations.CreateModel(
            name='ScanTrainingSample',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('ocr_result', models.JSONField(default=dict, help_text='What the AI read: header, items, totals, meta')),
                ('confirmed', models.JSONField(default=dict, help_text='What staff saved: header + items (the correct answer)')),
                ('corrections', models.JSONField(default=list, help_text='Fields staff changed: [{row, field, ai, final}]')),
                ('image_files', models.JSONField(default=list, help_text='Stored training copies of the page photos (if kept)')),
                ('rows', models.PositiveIntegerField(default=0)),
                ('corrected_fields', models.PositiveIntegerField(default=0)),
                ('model_name', models.CharField(blank=True, default='', max_length=100)),
                ('prompt_version', models.CharField(blank=True, default='', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('distributor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                                  related_name='scan_training_samples', to='purchases.distributor')),
                ('outlet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                             related_name='scan_training_samples', to='core.outlet')),
                ('purchase_invoice', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                                       related_name='scan_training_samples', to='purchases.purchaseinvoice')),
            ],
            options={'db_table': 'purchases_scantrainingsample', 'ordering': ['-created_at']},
        ),
    ]
