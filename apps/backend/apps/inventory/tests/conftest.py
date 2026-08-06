import pytest
from apps.accounts.tests.factories import OutletFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory, StockLedgerFactory
from datetime import timedelta
from django.utils import timezone

@pytest.fixture
def inventory_outlet(db):
    from django.core.management import call_command
    outlet = OutletFactory()
    call_command('seed_ledgers', outlet_id=str(outlet.id))
    return outlet

@pytest.fixture
def strip_product(db):
    return MasterProductFactory(
        name='Paracetamol 500mg',
        pack_type='strip',
        pack_size=10,
        pack_unit='tablet',
        mrp=50.00
    )

@pytest.fixture
def box_product(db):
    return MasterProductFactory(
        name='Hand Strap',
        pack_type='box',
        pack_size=1,
        pack_unit='piece',
        mrp=250.00
    )

@pytest.fixture
def low_stock_product(db):
    return MasterProductFactory(
        name='Aspirin 75mg',
        pack_type='strip',
        pack_size=15,
        pack_unit='tablet',
        mrp=30.00,
        min_qty=10  # threshold is 10 strips
    )

@pytest.fixture
def strip_batch(db, inventory_outlet, strip_product):
    batch = BatchFactory(
        outlet=inventory_outlet,
        product=strip_product,
        batch_no='STRIP-B1',
        pack_type='strip',
        pack_size=10,
        pack_unit='tablet',
        qty_strips=100,
        qty_loose=0,
        mrp=50.00,
        purchase_rate=40.00,
        expiry_date=timezone.now().date() + timedelta(days=365)
    )
    # Create opening stock ledger
    StockLedgerFactory(
        outlet=inventory_outlet,
        product=strip_product,
        batch=batch,
        txn_type='OPENING',
        txn_date=timezone.now().date(),
        voucher_type='Opening Stock',
        qty_in=100.0,
        qty_out=0.0,
        rate=40.00,
        value_in=4000.00,
        value_out=0.0,
        running_qty=100.0,
        running_value=4000.00
    )
    return batch

@pytest.fixture
def box_batch(db, inventory_outlet, box_product):
    batch = BatchFactory(
        outlet=inventory_outlet,
        product=box_product,
        batch_no='BOX-B1',
        pack_type='box',
        pack_size=1,
        pack_unit='piece',
        qty_strips=50,
        qty_loose=0,
        mrp=250.00,
        purchase_rate=200.00,
        expiry_date=timezone.now().date() + timedelta(days=730)
    )
    StockLedgerFactory(
        outlet=inventory_outlet,
        product=box_product,
        batch=batch,
        txn_type='OPENING',
        txn_date=timezone.now().date(),
        voucher_type='Opening Stock',
        qty_in=50.0,
        qty_out=0.0,
        rate=200.00,
        value_in=10000.00,
        value_out=0.0,
        running_qty=50.0,
        running_value=10000.00
    )
    return batch

@pytest.fixture
def low_stock_batch(db, inventory_outlet, low_stock_product):
    # threshold is 10 strips, let's make the stock 5 strips
    batch = BatchFactory(
        outlet=inventory_outlet,
        product=low_stock_product,
        batch_no='LOW-B1',
        pack_type='strip',
        pack_size=15,
        pack_unit='tablet',
        qty_strips=5,
        qty_loose=0,
        mrp=30.00,
        purchase_rate=20.00,
        expiry_date=timezone.now().date() + timedelta(days=180)
    )
    StockLedgerFactory(
        outlet=inventory_outlet,
        product=low_stock_product,
        batch=batch,
        txn_type='OPENING',
        txn_date=timezone.now().date(),
        voucher_type='Opening Stock',
        qty_in=5.0,
        qty_out=0.0,
        rate=20.00,
        value_in=100.00,
        value_out=0.0,
        running_qty=5.0,
        running_value=100.00
    )
    return batch
