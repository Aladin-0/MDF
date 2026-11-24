"""
Index for the Stock Ledger screen: an outlet's movements by date (newest first, date ranges).

Built CONCURRENTLY (atomic = False) so stock movements are not blocked while it builds on boot.
"""
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations, models


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('inventory', '0031_masterproduct_upper_trgm_indexes'),
    ]

    operations = [
        AddIndexConcurrently(
            model_name='stockledger',
            index=models.Index(fields=['outlet', 'txn_date', 'created_at'], name='inv_sl_outlet_date_idx'),
        ),
    ]
