from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseGstProvider(ABC):
    """
    Abstract base interface for GST Suvidha Providers (GSPs) and Sandbox environments.
    Any class implementing this must provide concrete implementations for the methods below.
    """

    @abstractmethod
    def authenticate_platform(self) -> str:
        """
        Authenticates the platform with the GSP/Sandbox.
        Returns the platform access token or session string.
        """
        pass

    @abstractmethod
    def request_taxpayer_otp(self, gstin: str, username: str) -> None:
        """
        Requests an OTP for taxpayer authentication.
        Raises an exception if the request fails.
        """
        pass

    @abstractmethod
    def verify_taxpayer_otp(self, gstin: str, username: str, otp: str) -> Dict[str, Any]:
        """
        Verifies the taxpayer OTP.
        Returns a dictionary containing session details like:
        {
            'auth_token': '...',
            'expires_in_seconds': 21600
        }
        """
        pass

    @abstractmethod
    def fetch_gstr2b(self, gstin: str, period: str, session_token: str) -> Dict[str, Any]:
        """
        Fetches GSTR-2B data for a given GSTIN and period.
        Requires a valid taxpayer session token.
        Returns the JSON payload for GSTR-2B.
        """
        pass

    @abstractmethod
    def file_gstr1(self, gstin: str, period: str, gstr1_json: Dict[str, Any], session_token: str) -> Dict[str, Any]:
        """
        Files/Uploads GSTR-1 to the provider.
        Returns the provider's response JSON.
        """
        pass

    @abstractmethod
    def file_gstr3b(self, gstin: str, period: str, gstr3b_json: Dict[str, Any], session_token: str) -> Dict[str, Any]:
        """
        Files/Uploads GSTR-3B to the provider.
        Returns the provider's response JSON.
        """
        pass
