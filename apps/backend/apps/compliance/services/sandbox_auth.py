import requests
from django.core.cache import cache
from apps.core.models import SandboxConfiguration

class SandboxAuthService:
    SANDBOX_AUTH_URL = "https://api.sandbox.co.in/authenticate"
    NIC_AUTH_URL = "https://api.sandbox.co.in/gst/compliance/e-invoice/tax-payer/authenticate?force=true"

    @staticmethod
    def get_sandbox_jwt(config: SandboxConfiguration) -> str:
        """Step 1: Get Sandbox API JWT (Valid for 24h)"""
        cache_key = f"sandbox_jwt_{config.id}"
        token = cache.get(cache_key)
        
        if token:
            return token
            
        from django.conf import settings
        api_key = getattr(settings, 'SANDBOX_API_KEY', None) or config.api_key
        api_secret = getattr(settings, 'SANDBOX_API_SECRET', None) or config.api_secret
        
        headers = {
            "accept": "application/json",
            "x-api-key": api_key,
            "x-api-secret": api_secret,
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
        
        from django.conf import settings
        
        headers = {
            "accept": "application/json",
            "authorization": sandbox_jwt,
            "Content-Type": "application/json",
            "x-api-key": getattr(settings, 'SANDBOX_API_KEY', None) or config.api_key,
            "x-api-version": "1.0.0"
        }
        
        username = getattr(settings, 'SANDBOX_NIC_USERNAME', None) or config.einvoice_username
        password = getattr(settings, 'SANDBOX_NIC_PASSWORD', None) or config.einvoice_password
        
        payload = {
            "username": username,
            "password": password,
            "gstin": gstin
        }
        
        response = requests.post(SandboxAuthService.NIC_AUTH_URL, headers=headers, json=payload)
        if response.status_code != 200:
            print(f"Sandbox NIC Auth Failed: {response.text}")
        response.raise_for_status()
        
        data = response.json()
        nic_token = data.get("Data", {}).get("AuthToken")
        
        # Cache for 5.5 hours to refresh just before the 6h NIC expiry
        cache.set(cache_key, nic_token, timeout=int(5.5 * 3600))
        return nic_token

    @staticmethod
    def get_nic_ewaybill_token(config: SandboxConfiguration, gstin: str) -> str:
        """Step 2: Get NIC Access Token for E-Way Bill via GSP Auth"""
        cache_key = f"nic_ewaybill_token_{config.id}_{gstin}"
        nic_token = cache.get(cache_key)
        
        if nic_token: return nic_token
            
        sandbox_jwt = SandboxAuthService.get_sandbox_jwt(config)
        
        from django.conf import settings
        
        headers = {
            "accept": "application/json",
            "authorization": sandbox_jwt,
            "Content-Type": "application/json",
            "x-api-key": getattr(settings, 'SANDBOX_API_KEY', None) or config.api_key,
            "x-api-version": "1.0.0"
        }
        
        username = getattr(settings, 'SANDBOX_NIC_USERNAME', None) or config.einvoice_username
        password = getattr(settings, 'SANDBOX_NIC_PASSWORD', None) or config.einvoice_password
        
        payload = {
            "username": username,
            "password": password,
            "gstin": gstin
        }
        
        url = "https://api.sandbox.co.in/gst/compliance/e-way-bill/tax-payer/authenticate"
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            print(f"Sandbox NIC EWB Auth Failed: {response.text}")
        response.raise_for_status()
        
        data = response.json()
        nic_token = data.get("Data", {}).get("AuthToken") or data.get("data", {}).get("AuthToken")
        if nic_token:
            cache.set(cache_key, nic_token, timeout=int(5.5 * 3600))
        return nic_token
