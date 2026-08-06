import os
import sys
import django
from unittest.mock import patch

# Setup Django
sys.path.append(os.path.join(os.getcwd(), 'apps/backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediflow.settings.base")
os.environ.setdefault("DB_HOST", "localhost")
django.setup()

from django.test import RequestFactory
from apps.purchases.views import PurchaseListView
from apps.purchases.models import PurchaseInvoice
from apps.inventory.models import Batch
from apps.core.models import Outlet
from django.contrib.auth import get_user_model

User = get_user_model()

def test():
    print("--- Database Verification ---")
    outlet = Outlet.objects.first()
    print(f"Outlet: {outlet.name}")
    
    invoices = PurchaseInvoice.objects.filter(outlet=outlet).order_by('-invoice_date', '-created_at')[:3]
    print(f"Top 3 Invoices: {[i.invoice_no for i in invoices]}")

    print("\n--- API Verification ---")
    factory = RequestFactory()
    request = factory.get(f'/api/v1/purchases/?outletId={outlet.id}&page=1&pageSize=10')
    
    user = User.objects.first()
    request.user = user
    request.user.outlet_id = outlet.id
    
    view = PurchaseListView.as_view()
    
    with patch('apps.purchases.views.PurchaseListView.permission_classes', []):
        response = view(request)
        
        if response.status_code == 200:
            data = response.data
            print("API Response successful.")
            print(f"Pagination: {data.get('pagination')}")
        else:
            print(f"API Error: {response.status_code}")
            print(response.data)

if __name__ == '__main__':
    test()
