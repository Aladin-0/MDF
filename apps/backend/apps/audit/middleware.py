import uuid
import contextvars
from ipware import get_client_ip

_audit_context = contextvars.ContextVar('audit_context', default={})

def get_audit_context():
    return _audit_context.get()

class AuditContextMiddleware:
    """
    Middleware to safely capture request context for audit logging.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ip, is_routable = get_client_ip(request)

        context_data = {
            'request': request,
            'request_id': request.META.get('HTTP_X_REQUEST_ID') or str(uuid.uuid4()),
            'ip_address': ip,
            'ip_is_routable': is_routable,
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'endpoint': request.path,
            'http_method': request.method,
        }
        
        token = _audit_context.set(context_data)
        
        try:
            response = self.get_response(request)
            return response
        finally:
            _audit_context.reset(token)
