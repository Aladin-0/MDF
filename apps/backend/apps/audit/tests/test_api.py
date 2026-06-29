from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from .factories import make_staff, make_product, make_outlet
from apps.audit.models import ActivityLog

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class AuditAPITests(APITestCase):
    def setUp(self):
        self.outlet = make_outlet()
        self.super_admin = make_staff(phone="9999999999", role="super_admin", outlet=self.outlet)
        self.super_admin.is_staff = True
        self.super_admin.is_superuser = True
        self.super_admin.save()
        
        self.staff_admin = make_staff(phone="8888888887", role="admin", outlet=self.outlet)
        self.staff_admin.is_staff = True
        self.staff_admin.is_superuser = False
        self.staff_admin.save()
        self.billing_staff = make_staff(phone="8888888888", role="billing_staff", outlet=self.outlet)
        
        self.list_url = reverse('activity-log-list')
        self.export_url = reverse('activity-log-export')
        
        # Create some logs
        ActivityLog.objects.create(
            user=self.super_admin,
            outlet=self.outlet,
            module="inventory",
            action="CREATE",
            entity_type="MasterProduct",
            description="Created product A"
        )
        ActivityLog.objects.create(
            user=self.billing_staff,
            outlet=self.outlet,
            module="billing",
            action="UPDATE",
            entity_type="SaleInvoice",
            description="Updated invoice"
        )

    def test_super_admin_can_view_logs(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # response may be paginated
        data = response.data.get('results', response.data)
        self.assertGreaterEqual(len(data), 2)

    def test_staff_admin_cannot_view_logs(self):
        self.client.force_authenticate(user=self.staff_admin)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, getattr(response, 'data', response.content))

    def test_unauthenticated_user_cannot_view_logs(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_list_logs(self):
        # IsAdminUser requires is_staff=True. In Staff model, is_staff might not be set for billing_staff
        self.billing_staff.is_staff = False
        self.billing_staff.save()
        self.client.force_authenticate(user=self.billing_staff)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_by_module(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.list_url + "?module=inventory")
        data = response.data.get('results', response.data)
        self.assertTrue(all(log['module'] == 'inventory' for log in data))

    def test_filter_by_action(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.list_url + "?action=CREATE")
        data = response.data.get('results', response.data)
        self.assertTrue(all(log['action'] == 'CREATE' for log in data))

    def test_filter_by_entity_type(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.list_url + "?entity_type=MasterProduct")
        data = response.data.get('results', response.data)
        self.assertTrue(all(log['entity_type'] == 'MasterProduct' for log in data))

    def test_filter_by_user(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.list_url + f"?user={self.super_admin.id}")
        data = response.data.get('results', response.data)
        # ensure we only get admin's logs
        self.assertTrue(all(log['user'] == str(self.super_admin.id) for log in data if 'user' in log and isinstance(log['user'], str)))

    def test_logs_cannot_be_created_via_api(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.post(self.list_url, {"module": "hack", "action": "CREATE"})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_logs_cannot_be_deleted_via_api(self):
        self.client.force_authenticate(user=self.super_admin)
        # generic delete on list url
        response = self.client.delete(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        
        # detail url if it exists, but the urlpatterns only show 'logs/' and 'logs/export/'
        response2 = self.client.delete(self.list_url + "1/")
        self.assertEqual(response2.status_code, status.HTTP_404_NOT_FOUND)

    def test_logs_cannot_be_updated_via_api(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.patch(self.list_url, {"module": "hack"})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_super_admin_can_export_logs(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.get('Content-Type'), 'text/csv')
        self.assertIn('attachment; filename="audit_logs.csv"', response.get('Content-Disposition'))

    def test_staff_admin_cannot_export_logs(self):
        self.client.force_authenticate(user=self.staff_admin)
        response = self.client.get(self.export_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
