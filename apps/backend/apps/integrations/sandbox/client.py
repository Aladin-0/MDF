import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.conf import settings
from apps.core.models import SandboxConfiguration

logger = logging.getLogger(__name__)

class SandboxIntegrationError(Exception):
    pass

class SandboxAPIClient:
    """
    Centralized HTTP Client for the Sandbox API (E-Invoice, E-Way Bill, GST).
    Handles credentials, timeouts, and automatic retry logic.
    """
    def __init__(self):
        # Audit .env loading as requested
        api_key_env = getattr(settings, 'SANDBOX_API_KEY', None)
        api_secret_env = getattr(settings, 'SANDBOX_API_SECRET', None)
        logger.warning(f"ENV Sandbox API Key loaded: {bool(api_key_env)}")
        logger.warning(f"ENV Sandbox API Secret loaded: {bool(api_secret_env)}")

        self.api_key, self.api_secret, self.base_url = self._get_credentials()
        self.session = self._build_session()
        self._access_token = None

    def _get_credentials(self):
        """Fetches Sandbox API keys dynamically from settings or Database"""
        api_key_env = getattr(settings, 'SANDBOX_API_KEY', None)
        api_secret_env = getattr(settings, 'SANDBOX_API_SECRET', None)
        base_url_env = getattr(settings, 'SANDBOX_BASE_URL', None) or 'https://api.sandbox.co.in'
        
        if api_key_env and api_secret_env:
            return api_key_env, api_secret_env, base_url_env.rstrip('/')
            
        config = SandboxConfiguration.objects.filter(active=True).first()
        if not config or not config.api_key or not config.api_secret:
            raise SandboxIntegrationError("Missing Sandbox Configuration in .env and Database")
        return config.api_key, config.api_secret, config.base_url.rstrip('/')

    def _build_session(self):
        """Configures the requests.Session with advanced retry logic."""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE", "POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def authenticate(self) -> str:
        """Fetches the platform access token, using Django cache to prevent rate-limiting."""
        from django.core.cache import cache
        cache_key = f"sandbox_platform_token_{self.api_key}"
        
        if self._access_token:
            return self._access_token
            
        cached_token = cache.get(cache_key)
        if cached_token:
            self._access_token = cached_token
            return cached_token

        url = f"{self.base_url}/authenticate"
        headers = {
            'x-api-key': self.api_key,
            'x-api-secret': self.api_secret,
            'x-api-version': '1.0',
            'accept': 'application/json',
            'content-type': 'application/json'
        }

        # Credential Debugger: Print masked API variables being sent.
        masked_key = f"{self.api_key[:6]}***{self.api_key[-4:]}" if self.api_key else "None"
        masked_secret = f"{self.api_secret[:6]}***{self.api_secret[-4:]}" if self.api_secret else "None"
        config = SandboxConfiguration.objects.filter(active=True).first()
        einvoice_username = config.einvoice_username if config else "None"
        masked_username = f"{einvoice_username[:3]}***" if einvoice_username and einvoice_username != "None" else "None"
        
        logger.warning(f"Auth Attempt - Platform API Key: {masked_key}, API Secret: {masked_secret}, Taxpayer Username: {masked_username}")

        try:
            response = self.session.post(url, headers=headers, timeout=10)
            if response.status_code == 401:
                logger.error(f"Sandbox 401 Unauthorized Body: {response.text}")
            response.raise_for_status()
            data = response.json()
            
            if 'access_token' not in data:
                raise SandboxIntegrationError("Authentication response missing access_token")
                
            self._access_token = data['access_token']
            # Sandbox tokens are valid for 6 hours (21600 seconds). Cache for 5.5 hours to be safe.
            cache.set(cache_key, self._access_token, timeout=19800)
            return self._access_token
            
        except requests.RequestException as e:
            logger.error(f"Sandbox Authentication failed: {str(e)}")
            raise SandboxIntegrationError(f"Network error during Sandbox authentication: {str(e)}")

    def request(self, method, endpoint, headers=None, **kwargs):
        """Unified request executor."""
        url = f"{self.base_url}{endpoint}"
        
        # Inject standard headers exactly as GSTR integration does
        req_headers = {
            'x-api-key': self.api_key,
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-source': 'primary',
            'x-api-version': '1.0.0'
        }
        
        if self._access_token:
            req_headers['authorization'] = self._access_token
        
        # Merge custom headers (like authorization)
        if headers:
            req_headers.update(headers)

        try:
            logger.error(f"SANDBOX REQUEST START: {method} {url}")
            if kwargs.get('json'):
                logger.error(f"SANDBOX REQUEST PAYLOAD: {kwargs.get('json')}")
            
            response = self.session.request(
                method=method,
                url=url,
                headers=req_headers,
                timeout=kwargs.pop('timeout', 30),
                **kwargs
            )
            
            logger.error(f"SANDBOX RESPONSE STATUS: {response.status_code}")
            logger.error(f"SANDBOX RESPONSE TEXT: {response.text}")
            
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            error_msg = str(e)
            if hasattr(e, 'response') and getattr(e, 'response') is not None:
                try:
                    error_data = e.response.json()
                    # Try to parse standard Sandbox array-based ErrorDetails
                    if 'ErrorDetails' in error_data and isinstance(error_data['ErrorDetails'], list) and len(error_data['ErrorDetails']) > 0:
                        err = error_data['ErrorDetails'][0]
                        error_msg = f"{err.get('ErrorCode', '')}: {err.get('ErrorMessage', '')}"
                    elif 'message' in error_data:
                        error_msg = error_data['message']
                except Exception:
                    error_msg = e.response.text
            logger.error(f"Sandbox API {method} {endpoint} failed: {error_msg}")
            raise SandboxIntegrationError(f"API Error: {error_msg}")

    def request_raw(self, method, endpoint, headers=None, **kwargs):
        """Unified request executor returning raw response content."""
        url = f"{self.base_url}{endpoint}"
        
        req_headers = {
            'x-api-key': self.api_key,
            'x-source': 'primary',
            'x-api-version': '1.0.0'
        }
        
        if self._access_token:
            req_headers['authorization'] = self._access_token
        
        if headers:
            req_headers.update(headers)

        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=req_headers,
                timeout=kwargs.pop('timeout', 30),
                **kwargs
            )
            response.raise_for_status()
            return response.content
        except requests.RequestException as e:
            error_msg = str(e)
            logger.error(f"Sandbox API {method} {endpoint} failed: {error_msg}")
            raise SandboxIntegrationError(f"API Raw Request Error: {error_msg}")
