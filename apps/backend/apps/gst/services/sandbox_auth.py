import os
import time
import requests
import logging
from apps.core.models import SandboxConfiguration

logger = logging.getLogger(__name__)

class SandboxAuthError(Exception):
    def __init__(self, status_code, message):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Sandbox Auth Error {status_code}: {message}")

# Module-level cache for the platform token
_TOKEN_CACHE = {
    'access_token': None,
    'expires_at': 0,
}

def get_sandbox_credentials():
    """
    Retrieves Sandbox credentials, preferring environment variables over the DB.
    """
    api_key = os.environ.get('SANDBOX_API_KEY')
    api_secret = os.environ.get('SANDBOX_API_SECRET')
    base_url = os.environ.get('SANDBOX_BASE_URL', 'https://api.sandbox.co.in')

    if api_key and api_secret:
        return {
            'api_key': api_key,
            'api_secret': api_secret,
            'base_url': base_url
        }

    config = SandboxConfiguration.objects.filter(active=True).first()
    if config and config.api_key and config.api_secret:
        return {
            'api_key': config.api_key,
            'api_secret': config.api_secret,
            'base_url': config.base_url or base_url
        }

    raise SandboxAuthError(500, "Missing Sandbox credentials in both environment and database.")

def fetch_sandbox_access_token():
    """
    Deprecated: Use get_active_provider().authenticate_platform() instead.
    Calls the active provider to obtain a new platform access token.
    """
    from apps.gst.provider import get_active_provider
    provider = get_active_provider()
    # The provider's authenticate_platform returns just the token.
    # We simulate the old return signature (token, expires_at) for backward compatibility
    # if anything relies on the exact tuple return.
    token = provider.authenticate_platform()
    return token, time.time() + (23 * 3600)

def get_sandbox_access_token():
    """
    Returns a cached access token from the active provider.
    """
    from apps.gst.provider import get_active_provider
    provider = get_active_provider()
    return provider.authenticate_platform()
