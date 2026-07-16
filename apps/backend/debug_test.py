import sys
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.prod')
import django
django.setup()

from django.test import Client
from apps.billing.tests.test_sale_edit_migration import SaleEditMigrationTests

class Runner(SaleEditMigrationTests):
    def run_debug(self):
        self.setUp()
        url = f"/api/v1/sales/{self.invoice.id}/"
        payload = self.get_put_payload(self.invoice)
        response = self.client.put(url, data=payload, content_type='application/json')
        print(response.status_code)
        print(response.json())

Runner('test_sale_detail_put_happy_path').run_debug()
