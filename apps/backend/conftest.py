import pytest
from rest_framework.test import APIClient
from apps.accounts.models import Staff

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def authenticated_client(api_client):
    from apps.accounts.tests.factories import OutletFactory, StaffFactory
    outlet = OutletFactory()
    user = StaffFactory(
        outlet=outlet,
        role="super_admin"
    )
    user.set_password("testpass123")
    user.save()
    api_client.force_authenticate(user=user)
    return api_client
