from django.test import TestCase, override_settings
from unittest.mock import patch
from .factories import make_staff, count_logs
from apps.audit.services import log_activity
from apps.audit.models import ActivityLog
import json

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class AsyncLoggingTests(TestCase):
    def setUp(self):
        self.staff = make_staff()

    def test_login_log_created_via_celery_eager(self):
        initial_count = count_logs(action="ASYNC_TEST")
        log_activity(
            action="ASYNC_TEST",
            module="test",
            user=self.staff
        )
        self.assertEqual(count_logs(action="ASYNC_TEST"), initial_count + 1)

    def test_crud_log_created_via_celery_eager(self):
        initial_count = count_logs(action="CREATE", module="test_crud")
        log_activity(
            action="CREATE",
            module="test_crud",
            user=self.staff
        )
        self.assertEqual(count_logs(action="CREATE", module="test_crud"), initial_count + 1)

    @patch('apps.audit.services.create_audit_log_async.delay')
    @patch('apps.audit.services.fallback_logger.error')
    def test_log_not_lost_if_celery_unavailable(self, mock_fallback, mock_delay):
        """
        GAP: No fallback DB logging when Celery is unavailable.
        The current implementation writes to a local file logger instead of trying
        a synchronous DB write. We verify that the fallback logger is called.
        """
        mock_delay.side_effect = Exception("Celery is down")
        
        initial_count = count_logs(action="CELERY_FAIL")
        
        # This shouldn't raise an error
        log_activity(
            action="CELERY_FAIL",
            module="test",
            user=self.staff
        )
        
        # Count should remain the same since it's not written to DB
        self.assertEqual(count_logs(action="CELERY_FAIL"), initial_count)
        
        # Verify fallback logger was called
        mock_fallback.assert_called_once()
        logged_data = json.loads(mock_fallback.call_args[0][0])
        self.assertEqual(logged_data["action"], "CELERY_FAIL")
        self.assertEqual(logged_data["error"], "Celery is down")
