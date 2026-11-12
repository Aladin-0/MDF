from django.db import migrations, models

def _canonical_pack_type(pack_type, pack_unit):
    # Frozen copy of the rule as it was when this migration was written. A migration must not
    # import live application code: the live helper has since been removed (see
    # apps/inventory/pack_rules.py) and the migration has to keep working on a fresh database.
    pt = (pack_type or '').strip().lower()
    pu = (pack_unit or '').strip().lower()
    if pt == 'strip' and pu in ['box', 'piece', 'bottle', 'vial', 'tube', 'packet']:
        return pu
    return pack_type


def fix_batch_pack_type(apps, schema_editor):
    Batch = apps.get_model('inventory', 'Batch')

    for batch in Batch.objects.select_related('product').all():
        correct_type = _canonical_pack_type(batch.pack_type, batch.pack_unit)
        if batch.pack_type != correct_type:
            batch.pack_type = correct_type
            batch.save(update_fields=['pack_type'])

class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0015_remove_batch_sale_rate_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='batch',
            name='pack_type',
            field=models.CharField(choices=[('strip', 'Strip'), ('bottle', 'Bottle'), ('vial', 'Vial'), ('box', 'Box'), ('blister', 'Blister'), ('tube', 'Tube'), ('packet', 'Packet'), ('other', 'Other')], max_length=20),
        ),
        migrations.RunPython(fix_batch_pack_type, reverse_code=migrations.RunPython.noop),
    ]
