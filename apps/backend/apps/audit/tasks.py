from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(name='apps.audit.tasks.create_audit_log_async', ignore_result=True)
def create_audit_log_async(log_data):
    """Kept only so that messages already queued under this name are consumed (by any worker) instead of piling up. New events never use it."""
    try:
        from apps.audit import recorder, vocabulary as vocab
        recorder.record(
            vocab.infer_code(log_data.get('module', ''), log_data.get('action', ''), log_data.get('entity_type', '')) or '',
            actor=log_data.get('user_id'), outlet=log_data.get('outlet_id'), module=log_data.get('module') or '', action=log_data.get('action') or '',
            entity_type=log_data.get('entity_type', ''), entity_id=log_data.get('entity_id', ''), entity_label=log_data.get('entity_label', ''),
            changes=log_data.get('changes_json'), metadata=log_data.get('metadata_json'), summary=log_data.get('description', ''), source='job',
        )
    except Exception:
        logger.exception('could not record a queued audit message')
