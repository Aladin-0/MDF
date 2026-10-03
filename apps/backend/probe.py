import os
import django
import sys
import requests

sys.path.append('/home/asta/coding/MDF/apps/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.dev')
django.setup()

from apps.compliance.services.sandbox_auth import SandboxAuthService
from apps.core.models import SandboxConfiguration
from django.conf import settings

def test_endpoints():
    config = SandboxConfiguration.objects.filter(active=True).first()
    gstin = "27AAPCM1753L2ZX"
    
    sandbox_jwt = SandboxAuthService.get_sandbox_jwt(config)
    nic_token = SandboxAuthService.get_nic_token(config, gstin)
    
    headers = {
        "accept": "application/json",
        "authorization": sandbox_jwt,
        "x-api-key": getattr(settings, 'SANDBOX_API_KEY', None) or config.api_key,
        "x-api-version": "1.0.0",
        "gstin": gstin,
        "nic-access-token": nic_token,
        "Content-Type": "application/json"
    }

    urls = [
        "/gst/compliance/e-way-bill/tax-payer/ewayapi",
        "/gst/compliance/ewaybill/v1.03/ewayapi",
        "/ewayapi/v1.03/ewayapi",
        "/gst/compliance/e-way-bill/taxpayer/authenticate",
        "/gst/compliance/e-way-bill/tax-payer/authenticate",
        "/gst/compliance/e-way-bill/consignor/bill"
    ]

    for path in urls:
        url = f"https://api.sandbox.co.in{path}"
        try:
            r = requests.post(url, headers=headers, json={"some": "payload"}, timeout=5)
            print(f"{path}: {r.status_code}")
            if r.status_code != 404:
                print(" ->", r.text)
        except Exception as e:
            print(f"{path}: {e}")

if __name__ == "__main__":
    test_endpoints()
