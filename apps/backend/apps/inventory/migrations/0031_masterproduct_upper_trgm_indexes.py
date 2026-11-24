"""
Trigram indexes on UPPER(name / composition / manufacturer).

Django compiles `icontains` / `istartswith` on PostgreSQL to `UPPER(col::text) LIKE UPPER(%s)`. The GIN indexes from
0024 are on the plain columns, so the planner could never use them and every medicine search scanned the whole
catalogue. These indexes match the expression Django actually emits.

Built CONCURRENTLY (atomic = False) so product writes are not blocked while the index builds on boot.
"""
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations
from django.db.models.functions import Upper


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('inventory', '0030_batch_supplier'),
    ]

    operations = [
        AddIndexConcurrently(
            model_name='masterproduct',
            index=GinIndex(OpClass(Upper('name'), name='gin_trgm_ops'), name='master_prod_uname_trgm_gin'),
        ),
        AddIndexConcurrently(
            model_name='masterproduct',
            index=GinIndex(OpClass(Upper('composition'), name='gin_trgm_ops'), name='master_prod_ucomp_trgm_gin'),
        ),
        AddIndexConcurrently(
            model_name='masterproduct',
            index=GinIndex(OpClass(Upper('manufacturer'), name='gin_trgm_ops'), name='master_prod_umfg_trgm_gin'),
        ),
        # Expression indexes have no statistics until the table is analysed; without them the planner keeps the full scan.
        migrations.RunSQL('ANALYZE inventory_masterproduct;', reverse_sql=migrations.RunSQL.noop),
    ]
