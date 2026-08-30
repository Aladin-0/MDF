import sys
from django.core.management.base import BaseCommand
from apps.gst.services.taxpayer_auth import request_gst_otp, TaxpayerAuthError

class Command(BaseCommand):
    help = "Requests a GST OTP for a given Outlet."

    def add_arguments(self, parser):
        parser.add_argument('outlet_id', type=str, help='The UUID of the Outlet')

    def handle(self, *args, **options):
        outlet_id = options['outlet_id']
        try:
            msg = request_gst_otp(outlet_id)
            self.stdout.write(self.style.SUCCESS(f"Success: {msg}"))
        except TaxpayerAuthError as e:
            self.stderr.write(self.style.ERROR(f"Failed: {e.message} (Status: {e.status_code})"))
            sys.exit(1)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Error: {str(e)}"))
            sys.exit(1)
