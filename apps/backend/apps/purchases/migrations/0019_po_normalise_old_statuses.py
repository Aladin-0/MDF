from django.db import migrations


def normalise(apps, schema_editor):
    """Older versions stored a PO's draft state as 'DRAFT'. The model and the lifecycle use 'SAVED' (shown as "Draft")."""
    PurchaseOrder = apps.get_model('purchases', 'PurchaseOrder')
    PurchaseOrder.objects.filter(status='DRAFT').update(status='SAVED')


class Migration(migrations.Migration):
    dependencies = [('purchases', '0018_po_unique_number')]
    operations = [migrations.RunPython(normalise, migrations.RunPython.noop)]
