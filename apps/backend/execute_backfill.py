import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
django.setup()

from django.apps import apps
from apps.audit.models import DocumentRevisionV2, ActivityEvent, SystemEvent

def backfill_tenant_ids():
    print("--- BACKFILL EXECUTION ---")
    
    # 1. DocumentRevisionV2
    revs = DocumentRevisionV2.objects.filter(tenant_id__isnull=True)
    rev_count = 0
    print("\nDocumentRevisionV2 Samples:")
    
    for idx, rev in enumerate(revs):
        model_class = rev.content_type.model_class()
        if model_class:
            instance = model_class.objects.filter(id=rev.object_id).first()
            if instance and hasattr(instance, 'outlet_id'):
                rev.tenant_id = str(instance.outlet_id)
                rev.save(update_fields=['tenant_id'])
                rev_count += 1
                if idx < 5:
                    print(f" - ID: {rev.id} | Entity: {rev.object_id} | Resolved tenant_id: {rev.tenant_id}")

    print(f"Repaired DocumentRevisionV2 total: {rev_count}")

    # Model mapping for Activity and System events
    model_mapping = {
        'PurchaseInvoice': apps.get_model('purchases', 'PurchaseInvoice'),
        'Voucher': apps.get_model('accounts', 'Voucher'),
        'SaleInvoice': apps.get_model('billing', 'SaleInvoice'),
    }

    # 2. ActivityEvent
    acts = ActivityEvent.objects.filter(tenant_id__isnull=True)
    act_count = 0
    print("\nActivityEvent Samples:")
    for idx, act in enumerate(acts):
        ModelClass = model_mapping.get(act.entity_type)
        if ModelClass:
            instance = ModelClass.objects.filter(id=act.entity_id).first()
            if instance and hasattr(instance, 'outlet_id'):
                act.tenant_id = str(instance.outlet_id)
                act.save(update_fields=['tenant_id'])
                act_count += 1
                if idx < 5:
                    print(f" - ID: {act.id} | Entity: {act.entity_id} | Resolved tenant_id: {act.tenant_id}")

    print(f"Repaired ActivityEvent total: {act_count}")

    # 3. SystemEvent
    sys_acts = SystemEvent.objects.filter(tenant_id__isnull=True)
    sys_count = 0
    print("\nSystemEvent Samples:")
    for idx, sys_act in enumerate(sys_acts):
        ModelClass = model_mapping.get(sys_act.entity_type)
        if ModelClass:
            instance = ModelClass.objects.filter(id=sys_act.entity_id).first()
            if instance and hasattr(instance, 'outlet_id'):
                sys_act.tenant_id = str(instance.outlet_id)
                sys_act.save(update_fields=['tenant_id'])
                sys_count += 1
                if idx < 5:
                    print(f" - ID: {sys_act.id} | Entity: {sys_act.entity_id} | Resolved tenant_id: {sys_act.tenant_id}")

    print(f"Repaired SystemEvent total: {sys_count}")
    print("--- END BACKFILL ---")

if __name__ == '__main__':
    backfill_tenant_ids()
