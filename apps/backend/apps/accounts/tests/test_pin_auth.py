import uuid
from django.test import TestCase
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient
from apps.accounts.models import Staff
from apps.core.models import Outlet, Organization

class StaffPinAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", organization=self.org)
        
        # Create an admin user to make the request (since IsAuthenticated is required)
        self.admin = Staff.objects.create(
            phone="9999999999",
            name="Admin User",
            outlet=self.outlet,
            role="admin",
            password=make_password("password123"),
            staff_pin=make_password("0000")
        )
        self.client.force_authenticate(user=self.admin)
        
        # Create a billing staff
        self.staff = Staff.objects.create(
            phone="8888888888",
            name="Billing User",
            outlet=self.outlet,
            role="billing_staff",
            password=make_password("password123"),
            staff_pin=make_password("1234")
        )

    def test_lookup_by_pin_success(self):
        url = '/api/v1/staff/lookup-by-pin/'
        data = {
            'pin': '1234',
            'outletId': str(self.outlet.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], str(self.staff.id))

    def test_lookup_by_pin_failure(self):
        url = '/api/v1/staff/lookup-by-pin/'
        data = {
            'pin': '9999',
            'outletId': str(self.outlet.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error']['code'], 'INVALID_PIN')
