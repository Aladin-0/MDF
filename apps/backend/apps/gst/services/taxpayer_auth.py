import os
import requests
import logging
from django.utils import timezone
from datetime import timedelta
from apps.core.models import Outlet, GstTaxpayerAuth
from apps.gst.services.sandbox_auth import get_sandbox_access_token, get_sandbox_credentials

logger = logging.getLogger(__name__)

class TaxpayerAuthError(Exception):
    def __init__(self, status_code, message):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Taxpayer Auth Error {status_code}: {message}")

class SessionExpiredError(Exception):
    pass

class TaxpayerSessionExpiredException(Exception):
    pass

def get_taxpayer_auth_for_outlet(outlet_id):
    """
    Retrieves or creates a GstTaxpayerAuth record for the given Outlet.
    """
    outlet = Outlet.objects.get(id=outlet_id)
    auth, created = GstTaxpayerAuth.objects.get_or_create(
        outlet=outlet,
        defaults={
            'gstin': outlet.gstin,
            'gst_username': os.environ.get('GST_USERNAME', 'mock_gst_user')
        }
    )
    # Ensure gstin is in sync
    if not created and auth.gstin != outlet.gstin:
        auth.gstin = outlet.gstin
        auth.save(update_fields=['gstin'])
        
    return auth

def request_gst_otp(outlet_id):
    """
    Requests a GST OTP from Sandbox for the given Outlet using the active provider.
    """
    auth = get_taxpayer_auth_for_outlet(outlet_id)
    
    # Rate limit: 1 minute
    if auth.last_otp_requested_at and timezone.now() < auth.last_otp_requested_at + timedelta(minutes=1):
        raise TaxpayerAuthError(429, "OTP requested too recently. Please wait before requesting again.")
        
    from apps.gst.provider import get_active_provider
    provider = get_active_provider()
    
    provider.request_taxpayer_otp(auth.gstin, auth.gst_username)
        
    auth.last_otp_requested_at = timezone.now()
    auth.save(update_fields=['last_otp_requested_at'])
    
    return "OTP requested; please enter OTP when received."

def verify_gst_otp(outlet_id, otp: str):
    """
    Verifies the OTP using the active provider and stores the resulting Taxpayer Session Token.
    """
    auth = get_taxpayer_auth_for_outlet(outlet_id)
    
    from apps.gst.provider import get_active_provider
    provider = get_active_provider()
    
    session_data = provider.verify_taxpayer_otp(auth.gstin, auth.gst_username, otp)
        
    auth.session_token = session_data['auth_token']
    auth.session_expires_at = timezone.now() + timedelta(seconds=session_data['expires_in_seconds'])
    auth.active = True
    auth.save()
    
    return "Taxpayer authenticated successfully."

def get_taxpayer_session_token(outlet_id):
    """
    Retrieves the valid Taxpayer Session Token for the Outlet.
    """
    auth = get_taxpayer_auth_for_outlet(outlet_id)
    if not auth.is_session_valid():
        raise SessionExpiredError("Taxpayer session has expired or is not active. Please request OTP again.")
    return auth.session_token
