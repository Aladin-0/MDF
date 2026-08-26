from apps.audit.models import DocumentRevisionV2
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.contrib.auth.models import AnonymousUser
from apps.accounts.models import Staff
from apps.core.permissions import has_bill_revision_permission, HasBillRevisionPermission
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView
from rest_framework.response import Response
import uuid

class MockView(APIView):
    permission_classes = [HasBillRevisionPermission]
    required_revision_permission = 'can_modify_draft_bill'

    def get(self, request, *args, **kwargs):
        return Response({'status': 'ok'})

class BillRevisionPermissionTests(TestCase):

    def setUp(self):
        from apps.core.models import Organization, Outlet
        self.org = Organization.objects.create(name='Test Org')
        self.outlet = Outlet.objects.create(name='Test Outlet', organization=self.org)
        self.staff_user = Staff.objects.create(name='Test Staff', phone='1234567890', role='billing_staff', outlet=self.outlet)
        self.admin_user = Staff.objects.create(name='Admin Staff', phone='0987654321', role='admin', outlet=self.outlet)
        self.factory = APIRequestFactory()

    def test_helper_admin_bypass(self):
        self.admin_user.can_modify_draft_bill = False
        self.admin_user.save()
        self.assertTrue(has_bill_revision_permission(self.admin_user, 'can_modify_draft_bill'))

    def test_helper_staff_with_permission(self):
        self.staff_user.can_modify_draft_bill = True
        self.staff_user.save()
        self.assertTrue(has_bill_revision_permission(self.staff_user, 'can_modify_draft_bill'))

    def test_helper_staff_without_permission(self):
        self.staff_user.can_modify_draft_bill = False
        self.staff_user.save()
        self.assertFalse(has_bill_revision_permission(self.staff_user, 'can_modify_draft_bill'))

    def test_helper_unauthenticated_user(self):
        self.assertFalse(has_bill_revision_permission(AnonymousUser(), 'can_modify_draft_bill'))

    def test_permission_class_allow(self):
        self.staff_user.can_modify_draft_bill = True
        self.staff_user.save()
        request = self.factory.get('/')
        request.user = self.staff_user
        request.query_params = {'outletId': str(self.outlet.id)}
        view = MockView()
        permission = HasBillRevisionPermission()
        self.assertTrue(permission.has_permission(request, view))

    def test_permission_class_deny(self):
        self.staff_user.can_modify_draft_bill = False
        self.staff_user.save()
        request = self.factory.get('/')
        request.user = self.staff_user
        request.query_params = {'outletId': str(self.outlet.id)}
        view = MockView()
        permission = HasBillRevisionPermission()
        self.assertFalse(permission.has_permission(request, view))

    def test_permission_class_no_required_perm_attribute(self):
        self.staff_user.can_modify_draft_bill = True
        self.staff_user.save()
        request = self.factory.get('/')
        request.user = self.staff_user
        request.query_params = {'outletId': str(self.outlet.id)}

        class BadView(APIView):
            permission_classes = [HasBillRevisionPermission]
        view = BadView()
        permission = HasBillRevisionPermission()
        self.assertFalse(permission.has_permission(request, view))