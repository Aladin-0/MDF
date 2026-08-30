import os
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.gst.provider.sandbox import SandboxGstProvider

class Command(BaseCommand):
    help = 'Diagnoses GST Provider configuration and secrets (without leaking keys)'

    def handle(self, *args, **kwargs):
        self.stdout.write("--- GST Provider Configuration Diagnostic ---")
        
        provider_mode = os.environ.get('SANDBOX_PROVIDER_MODE', getattr(settings, 'SANDBOX_PROVIDER_MODE', 'NOT_SET'))
        self.stdout.write(f"SANDBOX_PROVIDER_MODE: {provider_mode}")
        
        live_enabled = os.environ.get('ENABLE_GST_SANDBOX_LIVE_MODE', getattr(settings, 'ENABLE_GST_SANDBOX_LIVE_MODE', 'False'))
        self.stdout.write(f"ENABLE_GST_SANDBOX_LIVE_MODE: {live_enabled}")
        
        base_url = os.environ.get('SANDBOX_BASE_URL', getattr(settings, 'SANDBOX_BASE_URL', 'NOT_SET'))
        self.stdout.write(f"SANDBOX_BASE_URL: {base_url}")
        
        api_key = os.environ.get('SANDBOX_API_KEY', getattr(settings, 'SANDBOX_API_KEY', ''))
        api_secret = os.environ.get('SANDBOX_API_SECRET', getattr(settings, 'SANDBOX_API_SECRET', ''))
        
        # Redacted lengths
        self.stdout.write(f"API Key present: {'Yes' if api_key else 'No'} (len: {len(api_key)})")
        self.stdout.write(f"API Secret present: {'Yes' if api_secret else 'No'} (len: {len(api_secret)})")
        
        if api_key:
            self.stdout.write(f"API Key prefix: {api_key[:5]}...")
            
        try:
            provider = SandboxGstProvider()
            self.stdout.write(self.style.SUCCESS("SandboxGstProvider initialized successfully."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"SandboxGstProvider initialization failed: {str(e)}"))
            
        self.stdout.write("--- End Diagnostic ---")
