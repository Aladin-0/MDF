# SANDBOX AUTHENTICATION INTEGRATION PLAN

## 1. Schema & Security Assessment
Our current audit shows that `SandboxConfiguration` inside `apps/backend/apps/core/models.py` already implements Fernet symmetric encryption for credentials (`_api_key_encrypted`, `_einvoice_password_encrypted`, etc.). This properly secures the GSP username/password and API keys at rest. We do not need to add clear-text fields to `OutletSettings`, which safely prevents credential leaks via frontend API responses.

## 2. The Two-Step Auth Service & Caching Implementation
We will create a new service at `apps/backend/apps/compliance/services/sandbox_auth.py` utilizing Django's `cache` module to completely eliminate the ~2 second handshake latency on repeat sales.

```python
# apps/backend/apps/compliance/services/sandbox_auth.py
import requests
from django.core.cache import cache
from apps.core.models import SandboxConfiguration

class SandboxAuthService:
    SANDBOX_AUTH_URL = "https://api.sandbox.co.in/authenticate"
    NIC_AUTH_URL = "https://api.sandbox.co.in/gst/compliance/e-way-bill/tax-payer/authenticate"

    @staticmethod
    def get_sandbox_jwt(config: SandboxConfiguration) -> str:
        """Step 1: Get Sandbox API JWT (Valid for 24h)"""
        cache_key = f"sandbox_jwt_{config.id}"
        token = cache.get(cache_key)
        
        if token:
            return token
            
        headers = {
            "accept": "application/json",
            "x-api-key": config.api_key,
            "x-api-secret": config.api_secret,
            "x-api-version": "1.0"
        }
        
        response = requests.post(SandboxAuthService.SANDBOX_AUTH_URL, headers=headers)
        response.raise_for_status()
        token = response.json().get("access_token")
        
        # Cache for 23 hours to safely refresh before the 24h expiration
        cache.set(cache_key, token, timeout=23 * 3600)
        return token

    @staticmethod
    def get_nic_token(config: SandboxConfiguration, gstin: str) -> str:
        """Step 2: Get NIC Access Token via GSP Auth (Valid for ~6h)"""
        cache_key = f"nic_token_{config.id}_{gstin}"
        nic_token = cache.get(cache_key)
        
        if nic_token:
            return nic_token
            
        sandbox_jwt = SandboxAuthService.get_sandbox_jwt(config)
        
        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {sandbox_jwt}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "username": config.einvoice_username,
            "password": config.einvoice_password,
            "gstin": gstin
        }
        
        response = requests.post(SandboxAuthService.NIC_AUTH_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        data = response.json()
        nic_token = data.get("Data", {}).get("AuthToken")
        
        # Cache for 5.5 hours to refresh just before the 6h NIC expiry
        cache.set(cache_key, nic_token, timeout=int(5.5 * 3600))
        return nic_token
```

## 3. Integration Hook (E-Way Bill / E-Invoice Pipeline)
We will refactor the existing `request_ewaybill` function inside `apps/backend/apps/integrations/sandbox/ewaybill.py` to utilize the new caching layer. This prevents `SandboxAPIClient()` from authenticating synchronously on every checkout.

```python
# apps/backend/apps/integrations/sandbox/ewaybill.py
from apps.compliance.services.sandbox_auth import SandboxAuthService
from apps.core.models import SandboxConfiguration
import requests

def request_ewaybill(invoice: SaleInvoice) -> dict:
    """
    Sends the generated EWB payload to Sandbox with cached token injection.
    """
    config = SandboxConfiguration.objects.filter(active=True).first()
    if not config:
        raise Exception("Sandbox Configuration is missing or inactive.")
        
    gstin = invoice.outlet.gstin
    
    # 1. Fetch Cached Tokens (O(1) Redis Lookup)
    sandbox_jwt = SandboxAuthService.get_sandbox_jwt(config)
    nic_token = SandboxAuthService.get_nic_token(config, gstin)
    
    # 2. Inject Tokens into Headers
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {sandbox_jwt}",
        "gstin": gstin,
        "nic-access-token": nic_token,
        "Content-Type": "application/json"
    }

    # 3. Fire Generation Request
    payload = generate_ewb_payload(invoice)
    url = f"{config.base_url}/gst/compliance/e-way-bill/v1.03/ewayapi"
    
    response = requests.post(url, headers=headers, json={"action": "GENEWAYBILL", "data": payload})
    # Parse response...
```

## 4. Testing Strategy
To ensure the caching logic functions properly in production and prevents rate-limiting, we will implement the following QA strategy:
1. **Mocking `requests.post`:** Using Python's `unittest.mock.patch`, we will mock the Sandbox authentication endpoint. 
2. **Cold Start Assertion:** We will invoke `get_nic_token()` once and assert that `requests.post` was called exactly twice (once for Sandbox JWT, once for NIC token).
3. **Warm Cache Assertion:** We will immediately invoke `get_nic_token()` again for the same GSTIN and assert that `requests.post.call_count` remains exactly `2`. This proves the tokens were successfully pulled from Django's `cache` rather than the network.
4. **Time Travel Expiration:** Using a library like `freezegun`, we will advance the system clock by 6 hours, invoke the method again, and verify that `requests.post` is correctly triggered to renew the NIC token while relying on the still-valid 23-hour Sandbox JWT.
