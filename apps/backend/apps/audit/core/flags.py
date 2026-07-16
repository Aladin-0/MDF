from django.conf import settings

def is_v2_write_enabled() -> bool:
    """Returns whether the new Audit architecture writes are enabled."""
    return getattr(settings, 'AUDIT_V2_WRITE_ENABLED', False)

def is_v2_read_enabled() -> bool:
    """Returns whether the new Audit architecture reads are enabled."""
    return getattr(settings, 'AUDIT_V2_READ_ENABLED', False)
