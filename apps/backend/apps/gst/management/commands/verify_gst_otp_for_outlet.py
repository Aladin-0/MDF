import sys
from django.core.management.base import BaseCommand
from apps.gst.services.taxpayer_auth import verify_gst_otp, TaxpayerAuthError

class Command(BaseCommand):
    help = "Verifies a GST OTP for a given Outlet and saves the session token."

    def add_arguments(self, parser):
        parser.add_argument('outlet_id', type=str, help='The UUID of the Outlet')
        parser.add_argument('otp', type=str, help='The OTP received')

    def handle(self, *args, **options):
        outlet_id = options['outlet_id']
        otp = options['otp']
        try:
            msg = verify_gst_otp(outlet_id, otp)
            self.stdout.write(self.style.SUCCESS(f"Success: {msg}"))
        except TaxpayerAuthError as e:
            self.stderr.write(self.style.ERROR(f"Failed: {e.message} (Status: {e.status_code})"))
            sys.exit(1)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Error: {str(e)}"))
            sys.exit(1)
