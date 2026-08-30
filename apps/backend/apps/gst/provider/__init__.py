import os
from django.conf import settings
from .base import BaseGstProvider
from .sandbox import SandboxGstProvider

_ACTIVE_PROVIDER = None

def get_active_provider() -> BaseGstProvider:
    """
    Returns the active GST provider based on configuration.
    Currently only supports 'sandbox', but can be extended for 'cleartax', 'whitebooks', etc.
    """
    global _ACTIVE_PROVIDER
    if _ACTIVE_PROVIDER is not None:
        return _ACTIVE_PROVIDER

    provider_name = os.environ.get('GST_PROVIDER', getattr(settings, 'GST_PROVIDER', 'sandbox')).lower()

    if provider_name == 'sandbox':
        _ACTIVE_PROVIDER = SandboxGstProvider()
    else:
        # Fallback to Sandbox for now if unknown
        _ACTIVE_PROVIDER = SandboxGstProvider()

    return _ACTIVE_PROVIDER
