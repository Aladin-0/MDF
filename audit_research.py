import json
from django.db.models import Count
from apps.audit.models import DocumentRevision, ActivityLog
from apps.billing.models import SaleInvoice
from apps.purchases.models import PurchaseInvoice
from apps.accounts.models import Voucher

def research():
    print("=== REVISION SPOT CHECKS ===")
    for model, name in [(SaleInvoice, 'SaleInvoice'), (PurchaseInvoice, 'PurchaseInvoice'), (Voucher, 'Voucher')]:
        print(f"\n--- {name} Revisions ---")
        revs = DocumentRevision.objects.filter(content_type__model=name.lower()).order_by('-created_at')[:3]
        for r in revs:
            print(f"ID: {r.object_id} | Reason: {r.reason_code} | Diff: {json.dumps(r.diff_summary_json)}")
            
    print("\n=== ACTIVITY LOG SPOT CHECKS (User Present) ===")
    logs = ActivityLog.objects.exclude(user__isnull=True).order_by('-timestamp')[:20]
    for l in logs:
        print(f"[{l.timestamp}] User: {l.user_id} | Action: {l.action} | Module: {l.module} | Entity: {l.entity_type} ({l.entity_id}) | EP: {l.endpoint} | Desc: {l.description}")
        
    print("\n=== ACTIVITY LOG SPOT CHECKS (System/Null User) ===")
    sys_logs = ActivityLog.objects.filter(user__isnull=True).order_by('-timestamp')[:10]
    for l in sys_logs:
        print(f"[{l.timestamp}] Action: {l.action} | Module: {l.module} | Entity: {l.entity_type} ({l.entity_id}) | EP: {l.endpoint}")
        
    print("\n=== NULL USER ACTION BREAKDOWN ===")
    qs = ActivityLog.objects.filter(user__isnull=True).values('action', 'module').annotate(c=Count('id')).order_by('-c')[:15]
    for q in qs:
        print(f"{q['module']} - {q['action']}: {q['c']}")

research()
