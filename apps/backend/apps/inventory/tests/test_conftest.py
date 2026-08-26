import pytest
from apps.inventory.models import StockLedger, Batch, MasterProduct
from apps.core.models import Outlet

@pytest.mark.django_db
def test_conftest_fixtures(inventory_outlet, strip_product, box_product, low_stock_product, strip_batch, box_batch, low_stock_batch):
    assert inventory_outlet is not None
    assert isinstance(inventory_outlet, Outlet)
    assert strip_product is not None
    assert isinstance(strip_product, MasterProduct)
    assert box_product is not None
    assert low_stock_product is not None
    assert strip_batch is not None
    assert isinstance(strip_batch, Batch)
    assert strip_batch.product == strip_product
    assert StockLedger.objects.filter(batch=strip_batch).exists()
    assert StockLedger.objects.filter(batch=box_batch).exists()
    assert StockLedger.objects.filter(batch=low_stock_batch).exists()