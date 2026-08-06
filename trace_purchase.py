import os
import sys
import django
import json

sys.path.append(os.path.join(os.getcwd(), 'apps/backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
django.setup()

from apps.purchases.models import PurchaseInvoice
from apps.core.models import Outlet
from django.conf import settings
from rest_framework.test import APIRequestFactory, force_authenticate

def run():
    print("=== Trace Report ===")
    
    print(f"Database Environment: {settings.DATABASES['default']['NAME']} (Host: {settings.DATABASES['default'].get('HOST', 'localhost')})")
    
    outlets = Outlet.objects.all()
    if not outlets:
        print("No outlets found!")
        return
    outlet = outlets.first()
    print(f"Outlet: {outlet.name} (ID: {outlet.id})")
    
    invoices = PurchaseInvoice.objects.filter(outlet=outlet).order_by('-created_at')
    if not invoices.exists():
        print("No invoices found in the database!")
        return
    
    latest = invoices.first()
    print(f"Latest Invoice: {latest.invoice_no}")
    print(f"Exists in DB: Yes, under ID {latest.id}")
    print(f"Purchase Date: {latest.invoice_date}")
    print(f"Total Amount: {latest.grand_total}")
    
    from apps.purchases.views import PurchaseListView
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    user = User.objects.filter(outlet=outlet).first()
    if not user:
        user = User.objects.first()
        if user:
            user.outlet = outlet
            user.save()
    
    rf = APIRequestFactory()
    req = rf.get(f'/api/v1/purchases/?outletId={outlet.id}&page=1&pageSize=10')
    force_authenticate(req, user=user)
    view = PurchaseListView.as_view()
    res = view(req)
    
    if res.status_code == 200:
        data = res.data
        records = data.get('data', [])
        found = any(r['invoiceNo'] == latest.invoice_no for r in records)
        print(f"Visible in API (Dashboard Source): {found}")
        print(f"API Total Records: {data.get('pagination', {}).get('totalRecords')}")
    else:
        print(f"API Error: {res.status_code} - {res.data}")
        
    print("=== End Trace ===")

if __name__ == '__main__':
    run()
