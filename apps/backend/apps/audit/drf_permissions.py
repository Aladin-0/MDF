from rest_framework.permissions import BasePermission
from apps.audit.core.context import get_audit_context, set_audit_context

class AuditContextPermission(BasePermission):
    """
    A DRF permission class that doesn't actually check permissions,
    but hooks into the request lifecycle *after* DRF has authenticated the user.
    It sets the user_id and tenant_id on the AuditContext.
    """
    def has_permission(self, request, view):
        if hasattr(request, 'user') and request.user.is_authenticated:
            context = get_audit_context()
            if not context:
                # Fallback if middleware didn't run or context was lost
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
            
            context.user_id = str(request.user.id)
            # Use outletId query parameter if available (frontend uses it)
            outlet_id = request.query_params.get('outletId') or getattr(request, 'data', {}).get('outletId')
            
            if outlet_id:
                context.tenant_id = str(outlet_id)
            elif hasattr(request.user, 'outlet_id') and not context.tenant_id:
                context.tenant_id = str(request.user.outlet_id)
            
            set_audit_context(context)
            
        return True
