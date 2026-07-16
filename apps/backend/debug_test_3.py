import sys
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
import django
django.setup()

from django.test import Client
from apps.billing.tests.test_sale_edit_migration import SaleEditMigrationTests
from apps.audit.models import ActivityEvent, SystemEvent, DocumentRevisionV2

class Runner(SaleEditMigrationTests):
    def run_debug(self):
        self.setUp()
        url = f"/api/v1/sales/{self.invoice.id}/"
        payload = self.get_put_payload(self.invoice)
        self.client.put(url, data=payload, content_type='application/json')
        
        hist_url = f"/api/v1/audit/revisions/sale/{self.invoice.id}/"
        response = self.client.get(hist_url, {'outletId': str(self.outlet.id)})
        print("Status:", response.status_code)
        if response.status_code != 200:
            print(response.json())

Runner('test_history_api_read_path').run_debug()
