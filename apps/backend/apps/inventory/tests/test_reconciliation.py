import pytest
from io import StringIO
from django.core.management import call_command
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from apps.core.models import Outlet, Organization
from apps.inventory.models import MasterProduct, Batch, StockLedger

@pytest.mark.django_db
def test_reconcile_inventory_success():
    org = Organization.objects.create(name="Test Org")
    outlet = Outlet.objects.create(name="Test Outlet", organization=org)
    
    product = MasterProduct.objects.create(
        name="Paracetamol",
        pack_size=10,
        pack_unit="tablet",
        mrp=50.00
    )
    
    batch = Batch.objects.create(
        outlet=outlet,
        product=product,
        batch_no="BATCH001",
        expiry_date=timezone.now().date() + timedelta(days=365),
        mrp=Decimal("50.00"),
        purchase_rate=Decimal("40.00"),
        pack_size=10,
        qty_strips=5,
        qty_loose=0,
        is_active=True
    )
    
    StockLedger.objects.create(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type="OPENING",
        txn_date=timezone.now().date(),
        qty_in=Decimal("50.000"),
        qty_out=Decimal("0.000")
    )
    
    out = StringIO()
    call_command('reconcile_inventory', stdout=out)
    output = out.getvalue()
    
    assert "Zero discrepancies found" in output

@pytest.mark.django_db
def test_reconcile_inventory_discrepancy():
    org = Organization.objects.create(name="Test Org 2")
    outlet = Outlet.objects.create(name="Test Outlet 2", organization=org)
    
    product = MasterProduct.objects.create(
        name="Paracetamol 2",
        pack_size=10,
        pack_unit="tablet",
        mrp=50.00
    )
    
    batch = Batch.objects.create(
        outlet=outlet,
        product=product,
        batch_no="BATCH002",
        expiry_date=timezone.now().date() + timedelta(days=365),
        mrp=Decimal("50.00"),
        purchase_rate=Decimal("40.00"),
        pack_size=10,
        qty_strips=5,
        qty_loose=0,
        is_active=True
    )
    
    StockLedger.objects.create(
        outlet=outlet,
        product=product,
        batch=batch,
        txn_type="OPENING",
        txn_date=timezone.now().date(),
        qty_in=Decimal("60.000"),
        qty_out=Decimal("0.000")
    )
    
    out = StringIO()
    call_command('reconcile_inventory', stdout=out)
    output = out.getvalue()
    
    assert "discrepancies" in output
    assert "expected 60.000, got 50" in output
