from django.test import TestCase, RequestFactory
from django.contrib.auth.models import AnonymousUser
from apps.audit.core.context import AuditContext, get_audit_context, set_audit_context, reset_audit_context
from apps.audit.core.middleware import AuditContextMiddleware

class AuditContextTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def test_audit_context_defaults(self):
        context = get_audit_context()
        self.assertIsNone(context.user_id)
        self.assertIsNone(context.tenant_id)
        self.assertIsNone(context.ip_address)
        self.assertIsNone(context.request_id)
        self.assertEqual(context.actor_type, "system")

    def test_audit_context_set_and_reset(self):
        initial_context = get_audit_context()
        
        new_context = AuditContext(user_id="user123", actor_type="human")
        token = set_audit_context(new_context)
        
        self.assertEqual(get_audit_context().user_id, "user123")
        self.assertEqual(get_audit_context().actor_type, "human")
        
        reset_audit_context(token)
        self.assertEqual(get_audit_context().user_id, initial_context.user_id)

    def test_audit_context_middleware_unauthenticated(self):
        request = self.rf.get('/', HTTP_X_FORWARDED_FOR='192.168.1.1, 10.0.0.1', HTTP_X_TENANT_ID='tenant_a')
        request.user = AnonymousUser()
        request.session = {}
        
        middleware = AuditContextMiddleware(get_response=lambda r: r)
        middleware.process_request(request)
        middleware.process_view(request, None, None, None)
        
        context = get_audit_context()
        self.assertEqual(context.ip_address, '192.168.1.1')
        self.assertEqual(context.tenant_id, 'tenant_a')
        self.assertIsNone(context.user_id)
        self.assertEqual(context.actor_type, "human")
        self.assertIsNotNone(getattr(request, 'audit_request_id', None))
        self.assertEqual(context.request_id, request.audit_request_id)

    def test_audit_context_middleware_authenticated(self):
        class MockUser:
            is_authenticated = True
            id = "user-uuid"
            outlet_id = "outlet-uuid"
            
        request = self.rf.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.user = MockUser()
        request.session = type('SessionStore', (), {'session_key': 'session-123'})()
        
        middleware = AuditContextMiddleware(get_response=lambda r: r)
        middleware.process_request(request)
        middleware.process_view(request, None, None, None)
        
        context = get_audit_context()
        self.assertEqual(context.ip_address, '127.0.0.1')
        self.assertEqual(context.user_id, "user-uuid")
        self.assertEqual(context.tenant_id, "outlet-uuid")
        self.assertEqual(context.session_id, "session-123")
        self.assertEqual(context.actor_type, "human")
