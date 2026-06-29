from django.db.models.signals import pre_save, post_save, post_delete
from .services import log_activity
import logging

logger = logging.getLogger(__name__)

SENSITIVE_FIELDS = {'password', 'staff_pin', 'token', 'access_token', 'refresh_token'}

def register_audit(model, module_name, tracked_fields=None):
    def on_pre_save(sender, instance, **kwargs):
        if instance.pk:
            try:
                old_instance = sender.objects.get(pk=instance.pk)
                fields_to_get = tracked_fields or [f.name for f in sender._meta.fields if f.name not in SENSITIVE_FIELDS]
                instance._audit_old_state = {
                    f: getattr(old_instance, f) for f in fields_to_get
                }
            except sender.DoesNotExist:
                pass

    def on_post_save(sender, instance, created, **kwargs):
        action = "CREATE" if created else "UPDATE"
        changes = {}
        fields_to_get = tracked_fields or [f.name for f in sender._meta.fields if f.name not in SENSITIVE_FIELDS]
        
        new_state = {f: getattr(instance, f) for f in fields_to_get}

        if not created:
            old_state = getattr(instance, '_audit_old_state', {})
            for field in fields_to_get:
                old_val = old_state.get(field)
                new_val = new_state.get(field)
                if old_val != new_val:
                    changes[field] = {'old': str(old_val) if old_val is not None else None, 
                                      'new': str(new_val) if new_val is not None else None}
            if not changes:
                return # No tracked fields changed
        else:
            for field in fields_to_get:
                val = new_state.get(field)
                changes[field] = {'old': None, 'new': str(val) if val is not None else None}

        entity_label = str(instance)[:250]
        if hasattr(instance, 'name'):
            entity_label = str(getattr(instance, 'name'))[:250]

        user = getattr(instance, '_audit_user', None)
        if not user:
            user = getattr(instance, 'billed_by', None) or getattr(instance, 'user', None) or getattr(instance, 'created_by', None)

        log_activity(
            action=action,
            module=module_name,
            entity_type=sender.__name__,
            entity_id=instance.pk,
            entity_label=entity_label,
            description=f"Auto-logged {action} for {sender.__name__} {entity_label}",
            changes=changes,
            user=user
        )

    def on_post_delete(sender, instance, **kwargs):
        entity_label = str(instance)[:250]
        if hasattr(instance, 'name'):
            entity_label = str(getattr(instance, 'name'))[:250]
            
        user = getattr(instance, '_audit_user', None)
        if not user:
            user = getattr(instance, 'billed_by', None) or getattr(instance, 'user', None) or getattr(instance, 'created_by', None)

        log_activity(
            action="DELETE",
            module=module_name,
            entity_type=sender.__name__,
            entity_id=instance.pk,
            entity_label=entity_label,
            description=f"Auto-logged DELETE for {sender.__name__} {entity_label}",
            changes={},
            user=user
        )

    pre_save.connect(on_pre_save, sender=model, weak=False)
    post_save.connect(on_post_save, sender=model, weak=False)
    post_delete.connect(on_post_delete, sender=model, weak=False)
