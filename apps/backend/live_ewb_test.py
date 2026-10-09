import os
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from apps.core.models import SandboxConfiguration
from apps.integrations.sandbox.ewaybill import request_ewaybill
from apps.billing.models import SaleInvoice

def run_live_test():
    try:
        # Get the active config
        config = SandboxConfiguration.objects.get(active=True)
        print(f"Using API Key: {config.api_key[:15]}...")
        
        # Get the most recent Wholesale invoice
        invoice = SaleInvoice.objects.filter(sale_type='WHOLESALE').order_by('-created_at').first()
        if not invoice:
            print("No wholesale invoice found to test with.")
            return

        print(f"Attempting to generate E-Way Bill for Invoice: {invoice.invoice_no}")
        
        # Call the live API
        result = request_ewaybill(invoice)
        print("\n✅ SUCCESS!")
        print("E-Way Bill Data:", result)
        
    except Exception as e:
        print("\n❌ FAILED!")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")

if __name__ == '__main__':
    run_live_test()
