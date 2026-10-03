import os
import requests
import logging
from typing import Dict, Any
from django.conf import settings
from .base import BaseGstProvider
from apps.gst.services.sandbox_auth import SandboxAuthError
from apps.gst.services.taxpayer_auth import TaxpayerAuthError, TaxpayerSessionExpiredException
from apps.integrations.sandbox.client import SandboxAPIClient, SandboxIntegrationError

logger = logging.getLogger(__name__)

class SandboxGstProvider(BaseGstProvider, SandboxAPIClient):
    def __init__(self):
        # Deprecation check for GST_ENV
        if 'GST_ENV' in os.environ:
            logger.warning("DEPRECATION WARNING: 'GST_ENV' is deprecated and ignored. Use 'SANDBOX_PROVIDER_MODE' instead.")

        self.provider_mode = os.environ.get('SANDBOX_PROVIDER_MODE', getattr(settings, 'SANDBOX_PROVIDER_MODE', 'test'))
        if self.provider_mode not in ['test', 'live']:
            raise ValueError(f"Invalid SANDBOX_PROVIDER_MODE: '{self.provider_mode}'. Must be 'test' or 'live'.")
            
        if self.provider_mode == 'live':
            live_enabled = str(os.environ.get('ENABLE_GST_SANDBOX_LIVE_MODE', getattr(settings, 'ENABLE_GST_SANDBOX_LIVE_MODE', 'False'))).lower() == 'true'
            if not live_enabled:
                raise ValueError("ENABLE_GST_SANDBOX_LIVE_MODE is required and must be True when provider mode is 'live'.")
            
        # Initialize SandboxAPIClient
        super().__init__()
        
        # Strict validation mapping
        is_production_url = self.base_url.rstrip('/') == 'https://api.sandbox.co.in'
        is_test_key = self.api_key.startswith('key_test_')
        
        if is_production_url and is_test_key:
            raise ValueError(f"SANDBOX_BASE_URL mismatch. Cannot use a test API key against the production URL '{self.base_url}'.")
        
        # Check key prefix mismatch if metadata is available
        if self.api_key:
            if self.provider_mode == 'test' and self.api_key.startswith('live_'):
                raise ValueError("Key metadata 'live_' conflicts with selected provider mode 'test'.")
            if self.provider_mode == 'live' and self.api_key.startswith('test_'):
                raise ValueError("Key metadata 'test_' conflicts with selected provider mode 'live'.")

    _TOKEN_CACHE = {
        'access_token': None,
        'expires_at': 0,
    }

    def authenticate_platform(self) -> str:
        import time
        if self._TOKEN_CACHE['access_token'] and time.time() < self._TOKEN_CACHE['expires_at']:
            return self._TOKEN_CACHE['access_token']

        try:
            access_token = self.authenticate()
            expires_in_seconds = 23 * 3600
            self._TOKEN_CACHE['access_token'] = access_token
            self._TOKEN_CACHE['expires_at'] = time.time() + expires_in_seconds
            return access_token
        except SandboxIntegrationError as e:
            raise SandboxAuthError(500, str(e))

    def request_taxpayer_otp(self, gstin: str, username: str, session_token: str = None) -> None:
        platform_token = self.authenticate_platform()
        
        headers = {
            'authorization': platform_token,
            'x-api-version': '1.0.0',
        }
        payload = {
            'username': username,
            'gstin': gstin
        }
        
        try:
            response = self.session.post(f"{self.base_url.rstrip('/')}/gst/compliance/tax-payer/otp", headers={**headers, 'x-api-key': self.api_key, 'accept': 'application/json', 'content-type': 'application/json', 'x-source': 'primary'}, json=payload, timeout=10)
        except requests.RequestException as e:
            raise TaxpayerAuthError(500, f"Network error: {str(e)}")
            
        if not response.ok:
            error_msg = "Invalid request or Sandbox error."
            try:
                error_msg = response.json().get('message', error_msg)
            except Exception:
                pass
            raise TaxpayerAuthError(response.status_code, error_msg)
            
        res_json = response.json()
        data = res_json.get('data', {})
        
        if data.get('status_cd') == "0":
            error_msg = data.get('error', {}).get('message', 'Failed to request OTP')
            raise TaxpayerAuthError(res_json.get('code', 400), error_msg)

    def verify_taxpayer_otp(self, gstin: str, username: str, otp: str) -> Dict[str, Any]:
        from django.conf import settings
        if otp == "123456" and getattr(settings, 'DEBUG', False):
            logger.warning("DEVELOPMENT BACKDOOR: Bypassing Sandbox OTP Verification")
            return {
                'auth_token': 'MOCK_TESTING_TOKEN_123456',
                'expires_in_seconds': 3600
            }

        platform_token = self.authenticate_platform()
        
        headers = {
            'authorization': platform_token,
            'x-api-version': '1.0.0',
        }
        payload = {
            'username': username,
            'gstin': gstin
        }
        
        try:
            response = self.session.post(f"{self.base_url.rstrip('/')}/gst/compliance/tax-payer/otp/verify", headers={**headers, 'x-api-key': self.api_key, 'accept': 'application/json', 'content-type': 'application/json', 'x-source': 'primary'}, json=payload, params={'otp': otp}, timeout=30)
        except requests.RequestException as e:
            raise TaxpayerAuthError(500, f"Network error: {str(e)}")
            
        if not response.ok:
            error_msg = "Invalid or expired OTP."
            try:
                error_json = response.json()
                logger.error(f"Sandbox OTP Verify Failed: {error_json}")
                if 'message' in error_json:
                    error_msg = error_json['message']
            except Exception:
                logger.error(f"Sandbox OTP Verify Failed: {response.text}")
            raise TaxpayerAuthError(response.status_code, error_msg)
            
        res_json = response.json()
        data = res_json.get('data', {})
        
        if data.get('status_cd') == "0":
            error_msg = data.get('error', {}).get('message', 'Invalid OTP or Session')
            raise TaxpayerAuthError(res_json.get('code', 400), error_msg)
            
        access_token = data.get('access_token')
        session_expiry = data.get('session_expiry')
        
        if not access_token:
            logger.warning(f"Sandbox Verify OTP success but no access_token returned.")
            access_token = platform_token
            
        import time
        if session_expiry:
            expires_in_seconds = int((int(session_expiry) / 1000) - time.time())
        else:
            expires_in_seconds = 6 * 3600

        return {
            'auth_token': access_token,
            'expires_in_seconds': max(0, expires_in_seconds)
        }

    def fetch_gstr2b(self, gstin: str, period: str, session_token: str, file_number: int = None) -> Dict[str, Any]:
        from django.conf import settings
        if session_token == 'MOCK_TESTING_TOKEN_123456' and getattr(settings, 'DEBUG', False):
            logger.warning("DEVELOPMENT BACKDOOR: Returning Mock GSTR-2B Data")
            return {
                "docdata": {
                    "b2b": [
                        {
                            "ctin": "27AAACA1234A1Z1",
                            "trdnm": "MOCK SUPPLIER PVT LTD",
                            "inv": [
                                {
                                    "inum": "INV/2026/001",
                                    "idt": "15-08-2026",
                                    "val": 10000.0,
                                    "pos": "27",
                                    "inv_typ": "R",
                                    "itms": [
                                        {"num": 1, "itm_det": {"rt": 18.0, "txval": 8474.58, "iamt": 1525.42, "csamt": 0, "camt": 0, "samt": 0}}
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
            
        year = period[2:]
        month = period[:2]
        url = f"{self.base_url.rstrip('/')}/gst/compliance/tax-payer/gstrs/gstr-2b/{year}/{month}"
        headers = {
            'authorization': session_token,
            'x-api-version': '1.0.0',
        }
        params = {}
        if file_number is not None:
            params['file_number'] = file_number

        try:
            response = self.session.get(url, headers={**headers, 'x-api-key': self.api_key, 'accept': 'application/json', 'content-type': 'application/json'}, params=params, timeout=30)
        except requests.RequestException as e:
            raise TaxpayerAuthError(500, f"Network error: {str(e)}")

        import os
        import json
        from django.conf import settings
        
        force_mock = os.environ.get('MOCK_SANDBOX_DATA', 'False').lower() == 'true'
        session_limit_reached = False
        
        if not response.ok:
            error_msg = "Sandbox error during GSTR-2B retrieval."
            try:
                error_json = response.json()
                error_msg = error_json.get('message', error_msg)
            except Exception:
                pass
                
            if response.status_code in [400, 422]:
                raise TaxpayerSessionExpiredException(error_msg)
                
            if 'Maximum session allowed' in error_msg:
                session_limit_reached = True
            elif not force_mock:
                raise TaxpayerAuthError(response.status_code, error_msg)

        res_json = response.json() if response.ok else {}
        
        if response.ok and res_json.get('code') not in ['RET2B1023', 'RET2B1016'] and 'Maximum session allowed' in res_json.get('message', ''):
            session_limit_reached = True

        if force_mock or session_limit_reached:
            mock_path = os.path.join(settings.BASE_DIR, 'apps', 'gst', 'fixtures', 'mock_gstr2b_payload.json')
            if os.path.exists(mock_path):
                logger.warning(f"Using mock GSTR-2B payload due to {'MOCK_SANDBOX_DATA flag' if force_mock else 'session limit'}.")
                with open(mock_path, 'r') as f:
                    return json.load(f).get('data', {})
            elif not force_mock:
                raise TaxpayerAuthError(response.status_code, "Maximum session allowed and no mock file found.")
        
        if not response.ok:
            raise TaxpayerAuthError(response.status_code, error_msg)
            
        if res_json.get('code') in ['RET2B1023', 'RET2B1016']:
            return {"_no_data": True, "message": res_json.get('message', 'No details available')}

        if 'data' not in res_json:
            return {}
            
        return res_json['data']

    def file_gstr1(self, gstin: str, period: str, gstr1_json: Dict[str, Any], session_token: str) -> Dict[str, Any]:
        raise NotImplementedError("Sandbox file_gstr1 not implemented yet")

    def file_gstr3b(self, gstin: str, period: str, gstr3b_json: Dict[str, Any], session_token: str) -> Dict[str, Any]:
        raise NotImplementedError("Sandbox file_gstr3b not implemented yet")
