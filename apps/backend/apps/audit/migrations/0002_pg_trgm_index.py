from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations
import django.contrib.postgres.indexes

class Migration(migrations.Migration):

    dependencies = [
        ('audit', '0001_initial'),
    ]

    operations = [
        TrigramExtension(),
        migrations.AddIndex(
            model_name='activitylog',
            index=django.contrib.postgres.indexes.GinIndex(fields=['description'], name='audit_desc_gin_idx', opclasses=['gin_trgm_ops']),
        ),
        migrations.AddIndex(
            model_name='activitylog',
            index=django.contrib.postgres.indexes.GinIndex(fields=['entity_label'], name='audit_label_gin_idx', opclasses=['gin_trgm_ops']),
        ),
    ]
