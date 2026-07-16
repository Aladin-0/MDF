import uuid
from typing import Optional, Dict, Any, Union
from django.db import transaction
from django.contrib.contenttypes.models import ContentType
from .context import get_audit_context
from .registry import SnapshotBuilderRegistry
from .diff_engine import DiffEngine
from apps.audit.models import DocumentRevisionV2, ActivityEvent, SystemEvent
from apps.audit.core import flags

def record_activity(
    action: str,
    module: str,
    entity: Any,
    reason_code: str = "",
    reason_text: str = "",
    metadata: Dict = None,
    severity: str = "info"
) -> Optional[Union[ActivityEvent, SystemEvent]]:
    """Records an activity or system event depending on the current context."""
    if not flags.is_v2_write_enabled():
        return None

    context = get_audit_context()
    
    # We must not log human events if user_id is missing and it's supposedly human.
    # However, some systems might bypass auth, so we default to system if actor_id is missing
    # or handle it based on context.actor_type.
    actor_id = context.user_id
    actor_type = context.actor_type
    
    entity_type = entity.__class__.__name__ if entity else ""
    entity_id = str(entity.pk) if entity and hasattr(entity, 'pk') else ""
    
    entity_label = str(entity)[:250] if entity else ""
    if entity and hasattr(entity, 'name') and entity.name:
        entity_label = str(entity.name)[:250]

    with transaction.atomic():
        if actor_type == "human":
            event = ActivityEvent.objects.create(
                tenant_id=context.tenant_id,
                actor_id=actor_id,
                actor_type=actor_type,
                request_id=context.request_id,
                session_id=context.session_id,
                ip_address=context.ip_address,
                user_agent=context.user_agent,
                action=action,
                module=module,
                entity_type=entity_type,
                entity_id=entity_id,
                entity_label=entity_label,
                reason_code=reason_code,
                reason_text=reason_text,
                metadata_json=metadata or {},
                severity=severity
            )
        else:
            # System event
            event = SystemEvent.objects.create(
                tenant_id=context.tenant_id,
                event_name=action,
                component=module,
                source=actor_type, # e.g. "migration", "job"
                request_id=context.request_id,
                actor_type=actor_type,
                entity_type=entity_type,
                entity_id=entity_id,
                payload_json=metadata or {},
                severity=severity
            )
    return event

def record_revision(
    entity: Any,
    action: str,
    old_snapshot: Dict,
    new_snapshot: Dict,
    reason_code: str = "",
    reason_text: str = ""
) -> Optional[DocumentRevisionV2]:
    """Records a document revision and computes the diff."""
    if not flags.is_v2_write_enabled():
        return None

    context = get_audit_context()
    diff_summary = DiffEngine.compute_diff(entity.__class__.__name__, old_snapshot, new_snapshot)

    # Determine revision number (naively latest + 1)
    content_type = ContentType.objects.get_for_model(entity)
    latest_rev = DocumentRevisionV2.objects.filter(
        content_type=content_type, 
        object_id=entity.pk
    ).order_by('-revision_no').first()
    
    next_rev_no = latest_rev.revision_no + 1 if latest_rev else 1

    with transaction.atomic():
        revision = DocumentRevisionV2.objects.create(
            tenant_id=context.tenant_id,
            content_type=content_type,
            object_id=entity.pk,
            entity_type=entity.__class__.__name__,
            revision_no=next_rev_no,
            action=action,
            old_snapshot_json=old_snapshot,
            new_snapshot_json=new_snapshot,
            diff_summary_json=diff_summary,
            reason_code=reason_code,
            reason_text=reason_text,
            actor_id=context.user_id,
            actor_type=context.actor_type,
            request_id=context.request_id,
            source=context.actor_type # fallback
        )
    return revision

def record_mutation(
    entity: Any,
    action: str,
    module: str,
    old_snapshot: Dict,
    new_snapshot: Dict,
    reason_code: str = "",
    reason_text: str = "",
    metadata: Dict = None
):
    """Convenience wrapper that writes revision + activity together."""
    if not flags.is_v2_write_enabled():
        return

    with transaction.atomic():
        record_revision(
            entity=entity,
            action=action,
            old_snapshot=old_snapshot,
            new_snapshot=new_snapshot,
            reason_code=reason_code,
            reason_text=reason_text
        )
        record_activity(
            action=action,
            module=module,
            entity=entity,
            reason_code=reason_code,
            reason_text=reason_text,
            metadata=metadata
        )
