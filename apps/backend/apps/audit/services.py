import logging
import json
import os
from .middleware import get_audit_context
from .tasks import create_audit_log_async

logger = logging.getLogger(__name__)
fallback_logger = logging.getLogger('audit.fallback')

def log_activity(
    *,
    action,
    module,
    entity_type=None,
    entity_id=None,
    entity_label="",
    description="",
    changes=None,
    metadata=None,
    user=None,
    request=None,
    outlet=None,
    status_code=None,
    ip_is_routable=None
):
    """
    Central audit logging service that enqueues an ActivityLog safely.
    It will try to automatically populate user, outlet, request_id, etc. from context.
    """
    try:
        context = get_audit_context()
        
        if request is None and 'request' in context:
            request = context['request']
        
        if user is None and request and hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user
            
        if outlet is None and request and hasattr(request, 'outlet'):
            outlet = request.outlet

        endpoint = context.get('endpoint', "") if context else ""
        http_method = context.get('http_method', "") if context else ""
        ip_address = context.get('ip_address') if context else None
        if ip_is_routable is None and context:
            ip_is_routable = context.get('ip_is_routable')
        user_agent = context.get('user_agent', "") if context else ""
        request_id = context.get('request_id', "") if context else ""

        log_data = {
            'user_id': user.id if user else None,
            'outlet_id': outlet.id if outlet else None,
            'action': action,
            'module': module,
            'entity_type': entity_type or "",
            'entity_id': str(entity_id) if entity_id else "",
            'entity_label': entity_label,
            'description': description,
            'changes_json': changes or {},
            'metadata_json': metadata or {},
            'endpoint': endpoint,
            'http_method': http_method,
            'status_code': status_code,
            'ip_address': ip_address,
            'ip_is_routable': ip_is_routable,
            'user_agent': user_agent,
            'request_id': request_id
        }
        
        # Enqueue the task
        create_audit_log_async.delay(log_data)
        
    except Exception as e:
        # Never crash the main business flow if logging fails
        logger.error("Failed to enqueue audit log: %s", str(e), exc_info=True)
        # DB failure fallback logging
        os.makedirs('/app/logs', exist_ok=True)
        fallback_logger.error(json.dumps({
            'action': action,
            'module': module,
            'entity_type': entity_type,
            'entity_id': entity_id,
            'description': description,
            'error': str(e)
        }))
