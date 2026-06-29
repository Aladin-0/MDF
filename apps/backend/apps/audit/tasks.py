from celery import shared_task
import logging
import json
import os
from .models import ActivityLog

logger = logging.getLogger(__name__)
fallback_logger = logging.getLogger('audit.fallback')

@shared_task(name='apps.audit.tasks.create_audit_log_async', ignore_result=True)
def create_audit_log_async(log_data):
    try:
        ActivityLog.objects.create(
            user_id=log_data.get('user_id'),
            outlet_id=log_data.get('outlet_id'),
            action=log_data.get('action'),
            module=log_data.get('module'),
            entity_type=log_data.get('entity_type', ''),
            entity_id=log_data.get('entity_id', ''),
            entity_label=log_data.get('entity_label', ''),
            description=log_data.get('description', ''),
            changes_json=log_data.get('changes_json', {}),
            metadata_json=log_data.get('metadata_json', {}),
            endpoint=log_data.get('endpoint', ''),
            http_method=log_data.get('http_method', ''),
            status_code=log_data.get('status_code'),
            ip_address=log_data.get('ip_address'),
            ip_is_routable=log_data.get('ip_is_routable'),
            user_agent=log_data.get('user_agent', ''),
            request_id=log_data.get('request_id', '')
        )
    except Exception as e:
        logger.error(f"Failed to create audit log in DB: {e}", exc_info=True)
        # Fallback logging
        os.makedirs('/app/logs', exist_ok=True)
        fallback_logger.error(json.dumps(log_data))
