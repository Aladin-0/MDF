import pytest
from datetime import date
from django.test import TestCase
from unittest.mock import MagicMock
from apps.core.models import Outlet, Organization
from apps.inventory.models import Batch, MasterProduct
from apps.billing.sale_services import _canonical_pack_type
import importlib
migration_module = importlib.import_module('apps.inventory.migrations.0016_batch_pack_type_cleanup')
fix_batch_pack_type = migration_module.fix_batch_pack_type

class TestBatchSchema(TestCase):

    def setUp(self):
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(name='Test Outlet', organization=self.org)
        self.product_strip = MasterProduct.objects.create(name='Strip Prod', composition='Comp', manufacturer='Mfg', category='Cat', drug_type='allopathy', pack_size=10, pack_unit='tablet', pack_type='strip')
        self.product_bottle = MasterProduct.objects.create(name='Bottle Prod', composition='Comp', manufacturer='Mfg', category='Cat', drug_type='allopathy', pack_size=1, pack_unit='ml', pack_type='bottle')

    def test_canonical_pack_type_valid(self):
        self.assertEqual(_canonical_pack_type('bottle', 'ml'), 'bottle')
        self.assertEqual(_canonical_pack_type('strip', 'tablet'), 'strip')

    def test_canonical_pack_type_fallback_to_product(self):
        self.assertEqual(_canonical_pack_type('invalid_type', 'ml'), 'invalid_type')

    def test_canonical_pack_type_fallback_to_strip(self):
        self.assertEqual(_canonical_pack_type('strip', 'box'), 'box')

    def test_migration_fix_batch_pack_type(self):
        b1 = Batch.objects.create(outlet=self.outlet, product=self.product_bottle, batch_no='B4', expiry_date=date(2030, 1, 1), mrp=100, purchase_rate=50, pack_type='strip', pack_unit='bottle')
        b2 = Batch.objects.create(outlet=self.outlet, product=None, batch_no='B5', expiry_date=date(2030, 1, 1), mrp=100, purchase_rate=50, pack_type='strip', pack_unit='tablet')
        mock_apps = MagicMock()
        mock_apps.get_model.return_value = Batch
        fix_batch_pack_type(mock_apps, None)
        b1.refresh_from_db()
        b2.refresh_from_db()
        self.assertEqual(b1.pack_type, 'bottle')
        self.assertEqual(b2.pack_type, 'strip')