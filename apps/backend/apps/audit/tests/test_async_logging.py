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
        initial_count = count_logs(action='ASYNC_TEST')
        log_activity(action='ASYNC_TEST', module='test', user=self.staff)
        self.assertEqual(count_logs(action='ASYNC_TEST'), initial_count + 1)

    def test_crud_log_created_via_celery_eager(self):
        initial_count = count_logs(action='CREATE', module='test_crud')
        log_activity(action='CREATE', module='test_crud', user=self.staff)
        self.assertEqual(count_logs(action='CREATE', module='test_crud'), initial_count + 1)

    def test_event_is_written_even_if_celery_is_down(self):
        """Events no longer travel through a queue: a dead broker (or a worker nobody runs) can not lose them."""
        from apps.audit.tasks import create_audit_log_async
        with patch.object(create_audit_log_async, 'delay', side_effect=Exception('Celery is down')):
            before = count_logs(action='CELERY_FAIL')
            log_activity(action='CELERY_FAIL', module='test', user=self.staff)
            self.assertEqual(count_logs(action='CELERY_FAIL'), before + 1)

    def test_a_failing_audit_write_is_counted_and_never_raises(self):
        from apps.audit import recorder
        with patch.object(recorder, 'record', side_effect=RuntimeError('db is sad')):
            before = recorder.failed_writes()
            result = log_activity(action='BOOM', module='test', user=self.staff)   # must not raise: the sale it describes already happened
            self.assertIsNone(result)
            self.assertEqual(recorder.failed_writes(), before + 1)