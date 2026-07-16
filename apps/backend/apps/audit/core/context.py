import contextvars
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

@dataclass
class AuditContext:
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    actor_type: str = "system" # 'human', 'system', 'migration', etc.

# The context variable holds the current AuditContext instance
_audit_context_var: contextvars.ContextVar[AuditContext] = contextvars.ContextVar(
    'audit_context', default=AuditContext()
)

def get_audit_context() -> AuditContext:
    """Get the current audit context."""
    return _audit_context_var.get()

def set_audit_context(context: AuditContext) -> contextvars.Token:
    """
    Set the current audit context.
    Returns a token that can be used to reset the context later if needed.
    """
    return _audit_context_var.set(context)

def reset_audit_context(token: contextvars.Token):
    """Reset the audit context to the previous state using the token."""
    _audit_context_var.reset(token)
