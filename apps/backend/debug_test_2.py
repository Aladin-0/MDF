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
        self.setUpTestData()
        self.setUp()
        url = f"/api/v1/sales/{self.invoice.id}/"
        payload = self.get_put_payload(self.invoice)
        response = self.client.put(url, data=payload, content_type='application/json')
        print("Status:", response.status_code)
        
        print("ActivityEvents:", ActivityEvent.objects.count())
        print("SystemEvents:", SystemEvent.objects.count())
        print("DocumentRevisions:", DocumentRevisionV2.objects.count())

Runner('test_sale_detail_put_audit_write').run_debug()
