import pytest
from apps.accounts.tests.factories import CustomerFactory, OutletFactory
from apps.inventory.tests.factories import MasterProductFactory, BatchFactory

@pytest.fixture
def default_outlet(db):
    """Shared outlet for sales workflow tests."""
    return OutletFactory()

@pytest.fixture
def walkin_customer(default_outlet, db):
    """Walk-in customer (standard customer representing walk-ins)."""
    return CustomerFactory(outlet=default_outlet, name='Walk-in Customer', phone='0000000000')

@pytest.fixture
def registered_customer(default_outlet, db):
    """Standard registered credit customer."""
    return CustomerFactory(outlet=default_outlet, credit_limit=5000, name='Registered Customer')

@pytest.fixture
def product_a_pack10(db):
    """MasterProduct: simple tablet, Pack Type: Strip, Pack Size: 10."""
    return MasterProductFactory(name='Product A', pack_type='strip', pack_size=10, pack_unit='tablet')

@pytest.fixture
def product_b_inclusive(db):
    """MasterProduct: tax inclusive."""
    return MasterProductFactory(name='Product B (Inclusive)', gst_rate=12)

@pytest.fixture
def product_c_low_stock(db):
    """MasterProduct: low stock boundary testing."""
    return MasterProductFactory(name='Product C (Low Stock)', min_qty=10)

@pytest.fixture
def batch_a(default_outlet, product_a_pack10, db):
    """Inventory batch with stock: 100 strips."""
    return BatchFactory(outlet=default_outlet, product=product_a_pack10, qty_strips=100, qty_loose=0)

@pytest.fixture
def batch_b(default_outlet, product_b_inclusive, db):
    """Inventory batch with stock: 50 pieces."""
    return BatchFactory(outlet=default_outlet, product=product_b_inclusive, qty_strips=0, qty_loose=50)

@pytest.fixture
def batch_c(default_outlet, product_c_low_stock, db):
    """Inventory batch with stock: 2 pieces."""
    return BatchFactory(outlet=default_outlet, product=product_c_low_stock, qty_strips=0, qty_loose=2)