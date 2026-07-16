from rest_framework_simplejwt.authentication import JWTAuthentication
from apps.audit.core.context import get_audit_context, set_audit_context

class AuditJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that injects user_id and tenant_id into the
    AuditContext immediately after successful authentication.
    This guarantees that the audit context is correctly populated
    for all DRF views, even those that override permission_classes.
    """
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, token = result
            context = get_audit_context()
            if not context:
                # Fallback if middleware didn't run
                from apps.audit.core.context import AuditContext
                context = AuditContext(
                    user_id=None,
                    tenant_id=request.headers.get('X-Tenant-ID') or request.META.get('HTTP_OUTLETID'),
                    ip_address=request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR'),
                    user_agent=request.META.get('HTTP_USER_AGENT'),
                    request_id=request.headers.get('X-Request-ID'),
                    session_id=None,
                    actor_type="human"
                )
            
            context.user_id = str(user.id)
            
            # Extract outletId from request data/query if available
            outlet_id = request.query_params.get('outletId')
            if not outlet_id and hasattr(request, 'data') and isinstance(request.data, dict):
                outlet_id = request.data.get('outletId')
                
            if outlet_id:
                context.tenant_id = str(outlet_id)
            elif hasattr(user, 'outlet_id') and not context.tenant_id:
                context.tenant_id = str(user.outlet_id)
            
            set_audit_context(context)
            
        return result
