import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
django.setup()

from django.apps import apps
from apps.audit.models import DocumentRevisionV2, ActivityEvent, SystemEvent

def backfill_tenant_ids_dry_run():
    print("--- DRY RUN REPORT ---")
    
    # 1. DocumentRevisionV2
    revs = DocumentRevisionV2.objects.filter(tenant_id__isnull=True)
    rev_total = revs.count()
    print(f"\nDocumentRevisionV2 missing tenant_id: {rev_total}")
    
    rev_repaired = 0
    rev_skipped = 0
    
    for rev in revs:
        model_class = rev.content_type.model_class()
        if model_class:
            instance = model_class.objects.filter(id=rev.object_id).first()
            if instance and hasattr(instance, 'outlet_id'):
                rev_repaired += 1
            else:
                rev_skipped += 1
        else:
            rev_skipped += 1

    print(f"  Repaired: {rev_repaired}")
    print(f"  Skipped:  {rev_skipped}")

    # Model mapping for Activity and System events
    model_mapping = {
        'PurchaseInvoice': apps.get_model('purchases', 'PurchaseInvoice'),
        'Voucher': apps.get_model('accounts', 'Voucher'),
        'SaleInvoice': apps.get_model('billing', 'SaleInvoice'),
    }

    # 2. ActivityEvent
    acts = ActivityEvent.objects.filter(tenant_id__isnull=True)
    act_total = acts.count()
    print(f"\nActivityEvent missing tenant_id: {act_total}")
    
    act_repaired = 0
    act_skipped = 0
    for act in acts:
        ModelClass = model_mapping.get(act.entity_type)
        if ModelClass:
            instance = ModelClass.objects.filter(id=act.entity_id).first()
            if instance and hasattr(instance, 'outlet_id'):
                act_repaired += 1
            else:
                act_skipped += 1
        else:
            act_skipped += 1

    print(f"  Repaired: {act_repaired}")
    print(f"  Skipped:  {act_skipped}")

    # 3. SystemEvent
    sys_acts = SystemEvent.objects.filter(tenant_id__isnull=True)
    sys_total = sys_acts.count()
    print(f"\nSystemEvent missing tenant_id: {sys_total}")
    
    sys_repaired = 0
    sys_skipped = 0
    for sys_act in sys_acts:
        ModelClass = model_mapping.get(sys_act.entity_type)
        if ModelClass:
            instance = ModelClass.objects.filter(id=sys_act.entity_id).first()
            if instance and hasattr(instance, 'outlet_id'):
                sys_repaired += 1
            else:
                sys_skipped += 1
        else:
            sys_skipped += 1

    print(f"  Repaired: {sys_repaired}")
    print(f"  Skipped:  {sys_skipped}")
    print("--- END DRY RUN ---")

if __name__ == '__main__':
    backfill_tenant_ids_dry_run()
