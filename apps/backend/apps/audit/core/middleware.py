import uuid
from django.utils.deprecation import MiddlewareMixin
from .context import AuditContext, set_audit_context

class AuditContextMiddleware(MiddlewareMixin):
    """
    Middleware to bind HTTP request context (user, IP, etc.) to the
    AuditContext for the duration of the request.
    """
    
    def process_request(self, request):
        # Generate or extract request ID
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        request.audit_request_id = request_id
        
        # Extract IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')
            
        # Initialize Context
        context = AuditContext(
            user_id=None, # Will be set in process_view after Auth middleware runs
            tenant_id=request.headers.get('X-Tenant-ID') or request.META.get('HTTP_OUTLETID'),
            ip_address=ip_address,
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            request_id=request_id,
            session_id=request.session.session_key if hasattr(request, 'session') and hasattr(request.session, 'session_key') else None,
            actor_type="human"
        )
        
        set_audit_context(context)

    def process_view(self, request, view_func, view_args, view_kwargs):
        # Update user_id after authentication has occurred
        if hasattr(request, 'user') and request.user.is_authenticated:
            from .context import get_audit_context
            context = get_audit_context()
            context.user_id = str(request.user.id)
            if hasattr(request.user, 'outlet_id') and not context.tenant_id:
                context.tenant_id = str(request.user.outlet_id)
            set_audit_context(context)
