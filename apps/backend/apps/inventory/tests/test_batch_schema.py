import pytest
from datetime import date
from django.test import TestCase
from unittest.mock import MagicMock

from apps.core.models import Outlet
from apps.inventory.models import Batch, MasterProduct
from apps.billing.sale_services import _canonical_pack_type
import importlib
migration_module = importlib.import_module("apps.inventory.migrations.0016_batch_pack_type_cleanup")
fix_batch_pack_type = migration_module.fix_batch_pack_type
class TestBatchSchema(TestCase):
    def setUp(self):
        self.outlet = Outlet.objects.create(name="Test Outlet")
        self.product_strip = MasterProduct.objects.create(
            name="Strip Prod",
            composition="Comp",
            manufacturer="Mfg",
            category="Cat",
            drug_type="allopathy",
            pack_size=10,
            pack_unit="tablet",
            pack_type="strip"
        )
        self.product_bottle = MasterProduct.objects.create(
            name="Bottle Prod",
            composition="Comp",
            manufacturer="Mfg",
            category="Cat",
            drug_type="allopathy",
            pack_size=1,
            pack_unit="ml",
            pack_type="bottle"
        )

    def test_canonical_pack_type_valid(self):
        batch = Batch(
            outlet=self.outlet,
            product=self.product_bottle,
            batch_no="B1",
            expiry_date=date(2030, 1, 1),
            mrp=100,
            purchase_rate=80,
            pack_type="bottle"
        )
        self.assertEqual(_canonical_pack_type(batch), "bottle")

    def test_canonical_pack_type_fallback_to_product(self):
        batch = Batch(
            outlet=self.outlet,
            product=self.product_bottle,
            batch_no="B2",
            expiry_date=date(2030, 1, 1),
            mrp=100,
            purchase_rate=80,
            pack_type="invalid_type"
        )
        # Should fallback to product_bottle.pack_type -> bottle
        self.assertEqual(_canonical_pack_type(batch), "bottle")

    def test_canonical_pack_type_fallback_to_strip(self):
        batch = Batch(
            outlet=self.outlet,
            product=None,
            batch_no="B3",
            expiry_date=date(2030, 1, 1),
            mrp=100,
            purchase_rate=80,
            pack_type="invalid_type"
        )
        # No product, invalid type -> fallback to strip
        self.assertEqual(_canonical_pack_type(batch), "strip")

    def test_migration_fix_batch_pack_type(self):
        # Create batches bypassing normal save validation if needed, 
        # but here we can just save them with invalid types to test the migration
        b1 = Batch.objects.create(
            outlet=self.outlet,
            product=self.product_bottle,
            batch_no="B4",
            expiry_date=date(2030, 1, 1),
            mrp=100,
            purchase_rate=80,
            pack_type="invalid_type"
        )
        
        b2 = Batch.objects.create(
            outlet=self.outlet,
            product=None,
            batch_no="B5",
            expiry_date=date(2030, 1, 1),
            mrp=100,
            purchase_rate=80,
            pack_type=""
        )

        mock_apps = MagicMock()
        mock_apps.get_model.return_value = Batch

        # Run migration logic
        fix_batch_pack_type(mock_apps, None)

        b1.refresh_from_db()
        b2.refresh_from_db()

        self.assertEqual(b1.pack_type, "bottle")
        self.assertEqual(b2.pack_type, "strip")
