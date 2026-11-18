import time

from django.urls import reverse
from rest_framework.test import APITestCase

from apps.audit import recorder
from .factories import count_logs, make_staff, make_outlet


class UserTimelineTests(APITestCase):

    def setUp(self):
        self.outlet = make_outlet()
        self.staff_a = make_staff(phone='1111111111', pin='1234', outlet=self.outlet)
        self.staff_b = make_staff(phone='2222222222', pin='5678', outlet=self.outlet)
        self.login_url = '/api/v1/auth/login/'
        self.list_url = reverse('activity-log-list')

    def test_each_login_logged_separately(self):
        before = count_logs(action='LOGIN', actor_id=str(self.staff_a.id))
        self.client.post(self.login_url, {'phone': '1111111111', 'password': '1234'})
        self.client.post(self.login_url, {'phone': '1111111111', 'password': '1234'})
        self.assertEqual(count_logs(action='LOGIN', actor_id=str(self.staff_a.id)), before + 2)

    def test_user_a_logs_do_not_mix_with_user_b(self):
        self.client.post(self.login_url, {'phone': '1111111111', 'password': '1234'})
        self.client.post(self.login_url, {'phone': '2222222222', 'password': '5678'})
        self.assertEqual(count_logs(action='LOGIN', actor_id=str(self.staff_a.id)), 1)
        self.assertEqual(count_logs(action='LOGIN', actor_id=str(self.staff_b.id)), 1)

    def test_api_filter_by_person_returns_only_that_person(self):
        self.staff_a.role = 'super_admin'
        self.staff_a.save()
        recorder.record('product.edited', actor=self.staff_a, outlet=self.outlet, module='inventory', action='UPDATE')
        recorder.record('product.edited', actor=self.staff_b, outlet=self.outlet, module='inventory', action='UPDATE')
        self.client.force_authenticate(user=self.staff_a)
        response = self.client.get(self.list_url + f'?actor={self.staff_a.id}')
        self.assertEqual(response.status_code, 200)
        data = response.data['results']
        self.assertTrue(data)
        self.assertTrue(all(row['actor']['id'] == str(self.staff_a.id) for row in data))

    def test_events_are_newest_first(self):
        self.staff_a.role = 'super_admin'
        self.staff_a.save()
        recorder.record('product.edited', actor=self.staff_a, outlet=self.outlet, module='test', action='FIRST')
        time.sleep(0.01)
        recorder.record('product.edited', actor=self.staff_a, outlet=self.outlet, module='test', action='SECOND')
        self.client.force_authenticate(user=self.staff_a)
        actions = [r['action'] for r in self.client.get(self.list_url).data['results']]
        self.assertLess(actions.index('SECOND'), actions.index('FIRST'))
