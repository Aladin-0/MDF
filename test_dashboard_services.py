import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.accounts.services.dashboard_service import DashboardService
from apps.accounts.services.audit_service import AuditService
from apps.core.models import Outlet

def run_verification():
    outlet = Outlet.objects.first()
    if not outlet:
        print("No outlet found to test.")
        return

    print(f"Testing for outlet: {outlet.id}")
    
    try:
        kpis = DashboardService.get_financial_health_kpis(outlet.id)
        print("KPIs:", kpis)
    except Exception as e:
        print(f"KPIs Error: {e}")

    try:
        aging = DashboardService.get_aging_summary(outlet.id)
        print("Aging:", aging)
    except Exception as e:
        print(f"Aging Error: {e}")

    try:
        urgent = DashboardService.get_urgent_actions(outlet.id)
        print("Urgent Actions:", urgent)
    except Exception as e:
        print(f"Urgent Actions Error: {e}")

    try:
        audit = AuditService.get_recent_revisions(outlet.id)
        reconcile = AuditService.check_reconciliation_health(outlet.id)
        print("Audit:", audit)
        print("Reconcile:", reconcile)
    except Exception as e:
        print(f"Audit/Reconcile Error: {e}")

if __name__ == '__main__':
    run_verification()
