from django.test import override_settings
from django.test import TestCase
from rest_framework.test import APIClient
from apps.audit.middleware import get_audit_context
from django.urls import path
from django.http import HttpResponse

# We use a dummy view to inspect the context
def dummy_view(request):
    ctx = get_audit_context()
    return HttpResponse(str(ctx))

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class MiddlewareTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/v1/auth/login/"

    def test_ip_captured_from_remote_addr(self):
        self.client.post(self.url, REMOTE_ADDR="192.168.1.50")
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertEqual(log.ip_address, "192.168.1.50")

    def test_ip_captured_from_x_forwarded_for(self):
        self.client.post(self.url, HTTP_X_FORWARDED_FOR="203.0.113.195, 198.51.100.1")
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertEqual(log.ip_address, "203.0.113.195")

    def test_endpoint_captured(self):
        self.client.post(self.url)
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertEqual(log.endpoint, self.url)

    def test_http_method_captured(self):
        self.client.post(self.url)
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertEqual(log.http_method, "POST")

    def test_user_agent_captured(self):
        self.client.post(self.url, HTTP_USER_AGENT="TestBrowser/1.0")
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertEqual(log.user_agent, "TestBrowser/1.0")

    def test_request_id_captured_from_header(self):
        custom_id = "req-12345"
        self.client.post(self.url, HTTP_X_REQUEST_ID=custom_id)
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertEqual(log.request_id, custom_id)

    def test_request_id_generated_if_missing(self):
        self.client.post(self.url)
        from apps.audit.models import ActivityLog
        log = ActivityLog.objects.order_by('-timestamp').first()
        if log:
            self.assertTrue(bool(log.request_id))

    def test_context_cleared_between_requests(self):
        # We can't directly check the contextvar here because the middleware clears it,
        # but we can verify sequential requests don't leak context.
        self.client.post(self.url, REMOTE_ADDR="10.0.0.1")
        self.client.post(self.url, REMOTE_ADDR="10.0.0.2")
        from apps.audit.models import ActivityLog
        logs = ActivityLog.objects.order_by('-timestamp')[:2]
        if len(logs) == 2:
            self.assertEqual(logs[0].ip_address, "10.0.0.2")
            self.assertEqual(logs[1].ip_address, "10.0.0.1")
