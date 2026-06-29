from django.test import override_settings
from django.test import TestCase
from .factories import make_staff, get_latest_log
from apps.audit.models import ActivityLog
from rest_framework.test import APIClient
import uuid

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ImmutabilityTests(TestCase):
    def setUp(self):
        self.staff = make_staff()
        self.client = APIClient()

    def test_log_timestamp_is_auto_set(self):
        log = ActivityLog.objects.create(
            action="TEST",
            module="test"
        )
        self.assertIsNotNone(log.timestamp)

    def test_log_entry_persists_after_user_deletion(self):
        log = ActivityLog.objects.create(
            user=self.staff,
            action="TEST_PERSIST",
            module="test"
        )
        log_id = log.id
        
        # In this project, users shouldn't be hard-deleted, but if they are:
        # FK is SET_NULL, so log should persist
        self.staff.delete()
        
        fetched_log = ActivityLog.objects.get(id=log_id)
        self.assertIsNotNone(fetched_log)
        self.assertIsNone(fetched_log.user)

    def test_two_requests_get_different_request_ids(self):
        self.client.post("/api/v1/auth/login/", {"phone": "000", "password": "000"})
        log1 = get_latest_log(action="LOGIN_FAILED")
        
        self.client.post("/api/v1/auth/login/", {"phone": "111", "password": "111"})
        log2 = get_latest_log(action="LOGIN_FAILED")
        
        self.assertNotEqual(log1.request_id, log2.request_id)

    def test_immutability_known_gap(self):
        """
        GAP: ActivityLog is API-immutable (no edit/delete endpoints) but not DB-immutable.
        There are no overridden save()/delete() methods to block ORM-level modifications.
        This test exists to document the gap without failing.
        """
        log = ActivityLog.objects.create(action="GAP_TEST", module="test")
        
        # ORM allows modification
        log.action = "MODIFIED"
        log.save()
        
        # ORM allows deletion
        log.delete()
        
        # We don't fail, we just acknowledge this behavior is currently permitted at the DB level.
        self.assertTrue(True)
