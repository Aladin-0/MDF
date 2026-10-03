import os
import django
import sys
from decimal import Decimal

# Setup Django environment
sys.path.append('/home/asta/coding/MDF/apps/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.dev')
django.setup()

from apps.billing.tests.factories import make_test_outlet, make_test_customer, make_test_medicine, make_test_staff, make_test_invoice
from apps.integrations.sandbox.ewaybill import request_ewaybill, generate_ewb_payload
from apps.core.models import SandboxConfiguration
from django.core.cache import cache
import uuid

def test_live_sandbox():
    cache.clear()
    print("Creating scaffolding for live Sandbox E-Way Bill test...")
    
    from apps.core.models import Outlet
    from apps.accounts.models import Customer
    
    # 1. Scaffolding
    outlet = Outlet.objects.first()
    if not outlet:
        print("No outlet found!")
        return

    customer = Customer.objects.filter(name__icontains="ragu").first()
    if not customer:
        print("Creating ragu medical customer...")
        customer = make_test_customer(outlet, name="Ragu medical")
        customer.gstin = "27AABCA1234A1Z8"
        customer.state = "Maharashtra"
        customer.pincode = "400001"
        customer.save()

    product1, batch1 = make_test_medicine(outlet, name="JK Juice", mrp=5000, sale_rate=1500, batch_qty=500)
    product1.hsn_code = "3004"
    product1.save()

    product2, batch2 = make_test_medicine(outlet, name="JK Juice 2", mrp=5000, sale_rate=1500, batch_qty=500)
    product2.hsn_code = "3004"
    product2.save()

    from apps.accounts.models import Staff
    staff = Staff.objects.first()

    # Create Invoice matching the screenshot
    invoice = make_test_invoice(
        outlet=outlet,
        staff=staff,
        customer=customer,
        items=[
            {"batch": batch1, "qty": 115, "rate": 1500},
            {"batch": batch2, "qty": 155, "rate": 1500}
        ],
        paid=0
    )
    
    # Inject Wholesale & Transport fields from image
    invoice.sale_type = 'WHOLESALE'
    # Taxable amount needs to be derived. 
    # Net is 52000. Assuming 12% GST: 52000 / 1.12 = 46428.57
    invoice.taxable_amount = Decimal('46428.57')
    invoice.cgst_amount = Decimal('2785.71')
    invoice.sgst_amount = Decimal('2785.71')
    invoice.igst_amount = Decimal('0.00')
    invoice.grand_total = Decimal('52000.00')
    invoice.transporter_id = "27ABYFM7487N1ZU"
    invoice.vehicle_no = "MH20AB1234"
    invoice.trans_distance = 150
    invoice.trans_mode = 1
    invoice.vehicle_type = "R"
    invoice.eway_bill_status = "PENDING"
    invoice.save()
    
    # Fix sale items
    item1 = invoice.items.first()
    item1.taxable_amount = Decimal('19642.86') # For 22000
    item1.gst_rate = Decimal('12.00')
    item1.cgst_amount = Decimal('1178.57')
    item1.sgst_amount = Decimal('1178.57')
    item1.total_amount = Decimal('22000.00')
    item1.qty_loose = 115
    item1.qty_strips = 0
    item1.save()

    item2 = invoice.items.last()
    item2.taxable_amount = Decimal('26785.71') # For 30000
    item2.gst_rate = Decimal('12.00')
    item2.cgst_amount = Decimal('1607.14')
    item2.sgst_amount = Decimal('1607.15')
    item2.total_amount = Decimal('30000.00')
    item2.qty_loose = 155
    item2.qty_strips = 0
    item2.save()

    # Ensure config exists
    config = SandboxConfiguration.objects.first()
    if not config:
        print("Config missing!")
        return
        
    print("Payload:")
    import json
    print(json.dumps(generate_ewb_payload(invoice), indent=2))

    print("\n--- HITTING LIVE SANDBOX API ---")
    try:
        response = request_ewaybill(invoice)
        print("SUCCESS! Response:", response)
    except Exception as e:
        print("API FAILED:", e)
        if hasattr(e, 'response') and e.response:
            print("Response body:", e.response.text)
        elif hasattr(e, 'args'):
            print("Exception args:", e.args)

if __name__ == "__main__":
    test_live_sandbox()
