import sys
from django.core.management.base import BaseCommand
from apps.gst.services.sandbox_auth import get_sandbox_access_token, SandboxAuthError

class Command(BaseCommand):
    help = (
        "Checks Sandbox platform authentication.\n"
        "Requires SANDBOX_API_KEY, SANDBOX_API_SECRET, SANDBOX_BASE_URL to be set.\n"
        "Intended for dev/admin use, not public endpoints."
    )

    def handle(self, *args, **options):
        try:
            token = get_sandbox_access_token()
            token_str = str(token)
            length = len(token_str)
            prefix = token_str[:4] if length >= 4 else token_str
            self.stdout.write(
                self.style.SUCCESS(f"Sandbox auth OK (token length: {length}, prefix: {prefix}...)")
            )
        except SandboxAuthError as e:
            self.stderr.write(
                self.style.ERROR(f"Sandbox auth FAILED: status={e.status_code}, reason={e.message}")
            )
            sys.exit(1)
        except Exception as e:
            self.stderr.write(
                self.style.ERROR(f"Sandbox auth FAILED due to unexpected error: {str(e)}")
            )
            sys.exit(1)
