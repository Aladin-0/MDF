from django.db import migrations


def renumber_duplicates(apps, schema_editor):
    """The old numbering was "today's count + 1" with no lock, so duplicates may exist. Keep the first of each, suffix the rest."""
    PurchaseOrder = apps.get_model('purchases', 'PurchaseOrder')
    seen = {}
    for po in PurchaseOrder.objects.order_by('created_at', 'id'):
        key = (po.outlet_id, po.po_number)
        n = seen.get(key, 0) + 1
        seen[key] = n
        if n > 1:
            PurchaseOrder.objects.filter(pk=po.pk).update(po_number=f'{po.po_number}-D{n}'[:50])


class Migration(migrations.Migration):
    dependencies = [('purchases', '0016_po_lifecycle')]
    operations = [migrations.RunPython(renumber_duplicates, migrations.RunPython.noop)]
