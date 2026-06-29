from django.test import override_settings
from rest_framework.test import APITestCase
from django.urls import reverse
from .factories import make_staff, count_logs
from apps.audit.models import ActivityLog
import time

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class UserTimelineTests(APITestCase):
    def setUp(self):
        self.staff_a = make_staff(phone="1111111111", pin="1234")
        self.staff_b = make_staff(phone="2222222222", pin="5678")
        self.login_url = "/api/v1/auth/login/"
        self.list_url = reverse('activity-log-list')

    def test_each_login_logged_separately(self):
        initial_count = count_logs(action="LOGIN", user=self.staff_a)
        
        self.client.post(self.login_url, {"phone": "1111111111", "password": "1234"})
        self.client.post(self.login_url, {"phone": "1111111111", "password": "1234"})
        
        self.assertEqual(count_logs(action="LOGIN", user=self.staff_a), initial_count + 2)

    def test_user_a_logs_do_not_mix_with_user_b(self):
        self.client.post(self.login_url, {"phone": "1111111111", "password": "1234"})
        self.client.post(self.login_url, {"phone": "2222222222", "password": "5678"})
        
        logs_a = ActivityLog.objects.filter(user=self.staff_a, action="LOGIN")
        logs_b = ActivityLog.objects.filter(user=self.staff_b, action="LOGIN")
        
        self.assertEqual(logs_a.count(), 1)
        self.assertEqual(logs_b.count(), 1)
        self.assertNotEqual(logs_a.first().user, logs_b.first().user)

    def test_api_filter_by_user_returns_correct_logs(self):
        self.staff_a.is_staff = True
        self.staff_a.role = 'super_admin'
        self.staff_a.save()
        
        # staff a performs some actions
        ActivityLog.objects.create(user=self.staff_a, action="TEST_A", module="test")
        ActivityLog.objects.create(user=self.staff_b, action="TEST_B", module="test")
        
        self.client.force_authenticate(user=self.staff_a)
        response = self.client.get(self.list_url + f"?user={self.staff_a.id}")
        self.assertEqual(response.status_code, 200)
        data = response.data.get('data', response.data.get('results', response.data))
        
        self.assertTrue(len(data) > 0)
        self.assertTrue(all(log['user'] == str(self.staff_a.id) for log in data if 'user' in log and isinstance(log['user'], str)))

    def test_logs_ordered_newest_first(self):
        ActivityLog.objects.all().delete()
        
        log1 = ActivityLog.objects.create(user=self.staff_a, action="FIRST", module="test")
        # Ensure timestamp difference
        time.sleep(0.01)
        log2 = ActivityLog.objects.create(user=self.staff_a, action="SECOND", module="test")
        
        self.staff_a.is_staff = True
        self.staff_a.role = 'super_admin'
        self.staff_a.save()
        self.client.force_authenticate(user=self.staff_a)
        
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        data = response.data.get('data', response.data.get('results', response.data))
        
        # Check that SECOND appears before FIRST
        actions = [log['action'] for log in data]
        first_idx = actions.index("FIRST")
        second_idx = actions.index("SECOND")
        
        self.assertLess(second_idx, first_idx)
