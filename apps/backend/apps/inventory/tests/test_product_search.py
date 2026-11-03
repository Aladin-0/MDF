import pytest
from django.urls import reverse
from rest_framework import status
from apps.inventory.models import MasterProduct, Batch
from apps.core.models import Outlet, Organization
from django.contrib.auth import get_user_model
User = get_user_model()
from apps.inventory.tests.factories import MasterProductFactory

@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()

@pytest.fixture
def setup_data(db):
    org = Organization.objects.create(name="Test Org")
    outlet = Outlet.objects.create(name="Test Outlet", organization=org, state="MH")
    user = User.objects.create(phone="9999999999", role="admin", outlet=outlet)
    
    # Products
    p1 = MasterProduct.objects.create(
        name="Amoxicillin 500mg", composition="Amoxicillin", manufacturer="Test Mfg",
        pack_size=10, pack_unit="tablet", pack_type="strip"
    )
    p2 = MasterProduct.objects.create(
        name="Dolo 650mg Tablet", composition="Paracetamol", manufacturer="Micro Labs",
        pack_size=10, pack_unit="tablet", pack_type="strip"
    )
    p3 = MasterProduct.objects.create(
        name="Expired Med", composition="Expired", manufacturer="Test Mfg",
        pack_size=10, pack_unit="tablet", pack_type="strip"
    )
    
    # Stock
    Batch.objects.create(
        outlet=outlet, product=p1, batch_no="B1", expiry_date="2099-12-31",
        mrp=100, ptr=80, pts=70, purchase_rate=50, qty_strips=10, is_active=True
    )
    Batch.objects.create(
        outlet=outlet, product=p2, batch_no="B2", expiry_date="2099-12-31",
        mrp=100, ptr=80, pts=70, purchase_rate=50, qty_strips=10, is_active=True
    )
    Batch.objects.create(
        outlet=outlet, product=p3, batch_no="B3", expiry_date="2020-01-01",
        mrp=100, ptr=80, pts=70, purchase_rate=50, qty_strips=10, is_active=True
    )
    
    return {'client': api_client, 'user': user, 'outlet': outlet}

@pytest.mark.django_db
def test_search_typo_tolerance(setup_data, api_client):
    api_client.force_authenticate(user=setup_data['user'])
    url = reverse('product-search')
    
    # Test 1: Typo Tolerance
    response = api_client.get(url, {'q': 'Amoxcilin', 'outletId': str(setup_data['outlet'].id)})
    assert response.status_code == status.HTTP_200_OK
    data = response.json()['data']
    assert len(data) > 0
    assert data[0]['name'] == "Amoxicillin 500mg"

@pytest.mark.django_db
def test_search_word_order_invariance(setup_data, api_client):
    api_client.force_authenticate(user=setup_data['user'])
    url = reverse('product-search')
    
    # Test 2: Word Order Invariance
    response = api_client.get(url, {'q': '650 Dolo', 'outletId': str(setup_data['outlet'].id)})
    assert response.status_code == status.HTTP_200_OK
    data = response.json()['data']
    assert len(data) > 0
    assert data[0]['name'] == "Dolo 650mg Tablet"

@pytest.mark.django_db
def test_search_context_expiry(setup_data, api_client):
    api_client.force_authenticate(user=setup_data['user'])
    url = reverse('product-search')
    
    # Test 3a: Billing context (hides expired med)
    response = api_client.get(url, {'q': 'Expired', 'outletId': str(setup_data['outlet'].id), 'context': 'billing'})
    data = response.json()['data']
    # If the product only has expired batches, it might be returned as 0 stock if the subquery filtered them out.
    assert data[0]['totalStock'] == 0
    
    # Test 3b: Purchase context (shows expired med)
    response = api_client.get(url, {'q': 'Expired', 'outletId': str(setup_data['outlet'].id), 'context': 'purchase'})
    data = response.json()['data']
    assert data[0]['totalStock'] > 0


def _names(client, setup_data, q):
    client.force_authenticate(user=setup_data['user'])
    response = client.get(reverse('product-search'), {'q': q, 'outletId': str(setup_data['outlet'].id)})
    assert response.status_code == status.HTTP_200_OK
    return [row['name'] for row in response.json()['data']]


@pytest.mark.django_db
def test_gibberish_does_not_surface_unrelated_products(setup_data, api_client):
    """The typo fallback must not turn into noise: nothing resembles this, so nothing comes back."""
    assert _names(api_client, setup_data, 'zqxwvk') == []


@pytest.mark.django_db
def test_every_word_must_match_so_extra_words_narrow_the_results(setup_data, api_client):
    assert _names(api_client, setup_data, 'dolo tablet') == ['Dolo 650mg Tablet']
    assert _names(api_client, setup_data, 'dolo capsule') == []


@pytest.mark.django_db
def test_search_matches_composition_and_manufacturer(setup_data, api_client):
    assert 'Dolo 650mg Tablet' in _names(api_client, setup_data, 'paracetamol')
    assert 'Dolo 650mg Tablet' in _names(api_client, setup_data, 'micro labs')


@pytest.mark.django_db
def test_names_starting_with_the_query_rank_before_other_matches(setup_data, api_client):
    MasterProduct.objects.create(
        name="Paradolo Syrup", composition="Dolo base", manufacturer="X",
        pack_size=1, pack_unit="bottle", pack_type="bottle",
    )
    p = MasterProduct.objects.get(name="Paradolo Syrup")
    Batch.objects.create(outlet=setup_data['outlet'], product=p, batch_no="BP", expiry_date="2099-12-31",
                         mrp=100, ptr=80, pts=70, purchase_rate=50, qty_strips=5, is_active=True)
    names = _names(api_client, setup_data, 'dolo')
    assert names.index('Dolo 650mg Tablet') < names.index('Paradolo Syrup')


@pytest.mark.django_db
def test_discontinued_products_are_never_returned_even_by_fuzzy_match(setup_data, api_client):
    MasterProduct.objects.filter(name="Amoxicillin 500mg").update(is_discontinued=True)
    assert _names(api_client, setup_data, 'Amoxcilin') == []
