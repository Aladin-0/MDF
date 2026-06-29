from django.test import TestCase
from rest_framework.test import APIRequestFactory
from apps.audit.permissions import IsSuperAdmin
from apps.audit.tests.factories import make_staff, make_outlet
from django.contrib.auth.models import AnonymousUser

class IsSuperAdminPermissionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.permission = IsSuperAdmin()
        self.outlet = make_outlet()
        
        # Test users
        self.super_admin = make_staff(phone="9999999999", role="super_admin", outlet=self.outlet)
        self.super_admin.is_superuser = True
        self.super_admin.save()
        
        self.django_superuser = make_staff(phone="8888888889", role="billing_staff", outlet=self.outlet)
        self.django_superuser.is_superuser = True
        self.django_superuser.save()
        
        self.staff_admin = make_staff(phone="8888888888", role="admin", outlet=self.outlet)
        self.staff_admin.is_staff = True
        self.staff_admin.save()
        
        self.billing_staff = make_staff(phone="7777777777", role="billing_staff", outlet=self.outlet)
        self.billing_staff.save()

    def test_is_super_admin_blocks_unauthenticated(self):
        request = self.factory.get('/')
        request.user = AnonymousUser()
        self.assertFalse(self.permission.has_permission(request, None))

    def test_is_super_admin_blocks_regular_staff(self):
        request = self.factory.get('/')
        request.user = self.billing_staff
        self.assertFalse(self.permission.has_permission(request, None))

    def test_is_super_admin_blocks_outlet_admin(self):
        request = self.factory.get('/')
        request.user = self.staff_admin
        self.assertFalse(self.permission.has_permission(request, None))

    def test_is_super_admin_allows_super_admin(self):
        request = self.factory.get('/')
        request.user = self.super_admin
        self.assertTrue(self.permission.has_permission(request, None))

    def test_is_super_admin_blocks_django_superuser_without_role(self):
        request = self.factory.get('/')
        request.user = self.django_superuser
        self.assertFalse(self.permission.has_permission(request, None))
