import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from apps.inventory.tests.factories import BatchFactory, ProductFactory
from apps.accounts.tests.factories import OutletFactory, UserFactory

@pytest.mark.django_db
def test_inventory_valuation_endpoint():
    outlet = OutletFactory()
    user = UserFactory(is_staff=True)
    
    product = ProductFactory(name="Test Med", pack_size=10, pack_type="strip")
    batch = BatchFactory(
        outlet=outlet,
        product=product,
        pack_size=10,
        qty_strips=10,
        qty_loose=5,
        purchase_rate=80.0,
        landing_rate=85.0,
        mrp=100.0,
        is_active=True
    )

    client = APIClient()
    client.force_authenticate(user=user)
    
    url = f"/api/v1/reports/inventory/valuation/?outletId={outlet.id}"
    response = client.get(url)
    
    assert response.status_code == 200
    data = response.json()['data']
    
    # 10 strips + 5 loose (pack size 10) = 10.5 effective qty
    # purchase = 10.5 * 80 = 840.0
    # landing = 10.5 * 85 = 892.5
    # mrp = 10.5 * 100 = 1050.0
    
    assert data['total_value_purchase'] == 840.0
    assert data['total_value_landing'] == 892.5
    assert data['total_value_mrp'] == 1050.0
    
    products = data['products']
    assert len(products) == 1
    p = products[0]
    
    assert p['totalQty'] == 10
    assert p['valuation_purchase'] == 840.0
    assert p['valuation_landing'] == 892.5
    assert p['valuation_mrp'] == 1050.0
    
    assert len(p['batches']) == 1
    b = p['batches'][0]
    assert b['qty'] == 10
    assert b['qtyLoose'] == 5
    assert b['valuation_purchase'] == 840.0
    assert b['valuation_landing'] == 892.5
    assert b['valuation_mrp'] == 1050.0
