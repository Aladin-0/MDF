import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('purchases', '0020_distributor_ocr_aliases')]

    operations = [
        migrations.AddField(
            model_name='purchaseinvoice',
            name='scan_uploaded_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True,
                                       help_text='When the scan photo was uploaded (photo auto-deleted later)'),
        ),
        migrations.CreateModel(
            name='PurchaseInvoicePage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('page_no', models.PositiveSmallIntegerField(help_text='2 for the second page, 3 for the third, ...')),
                ('image', models.ImageField(upload_to='purchase_invoices/%Y/%m/')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('invoice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                              related_name='extra_pages', to='purchases.purchaseinvoice')),
            ],
            options={
                'db_table': 'purchases_purchaseinvoicepage',
                'ordering': ['page_no'],
                'unique_together': {('invoice', 'page_no')},
            },
        ),
    ]
