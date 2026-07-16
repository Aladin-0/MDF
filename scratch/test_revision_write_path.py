import json
import traceback
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.test import force_authenticate
from apps.billing.views import SaleReviseView
from apps.billing.models import SaleInvoice
from apps.audit.models import DocumentRevisionV2

def test_revise():
    factory = RequestFactory()
    invoice = SaleInvoice.objects.first()
    if not invoice:
        print("No invoice found!")
        return

    print(f"Target Invoice ID: {invoice.id}")
    print(f"Original Grand Total: {invoice.grand_total}")
    
    User = get_user_model()
    user = User.objects.first()
    
    payload = {
        "outletId": str(invoice.outlet_id),
        "billedBy": str(user.id),
        "items": [
            {
                "batchId": "mock-batch",
                "name": "Test Item",
                "qtyStrips": 1,
                "qtyLoose": 0,
                "saleMode": "strip",
                "mrp": 100,
                "saleRate": 90,
                "packSize": 10,
                "rate": 90,
                "discountPct": 0,
                "gstRate": 12,
                "scheduleType": "OTC",
                "taxableAmount": 80.36,
                "gstAmount": 9.64,
                "totalAmount": 90
            }
        ],
        "subtotal": 90,
        "discountAmount": 0,
        "taxableAmount": 80.36,
        "cgstAmount": 4.82,
        "sgstAmount": 4.82,
        "igstAmount": 0,
        "cgst": 4.82,
        "sgst": 4.82,
        "igst": 0,
        "roundOff": 0,
        "grandTotal": 90,
        "extraDiscountPct": 0,
        "paymentMode": "cash",
        "cashPaid": 90,
        "upiPaid": 0,
        "cardPaid": 0,
        "creditGiven": 0,
        "revisionAction": "commercial_correction",
        "revisionReasonCode": "ENTRY_ERROR_RATE",
        "revisionReasonText": "Testing edit invoice write path"
    }

    try:
        request = factory.post(f'/api/v1/sales/{invoice.id}/revise/', data=payload, content_type='application/json')
        force_authenticate(request, user=user)
        
        view = SaleReviseView.as_view()
        response = view(request, sale_id=invoice.id)
        
        print("--- API RESPONSE ---")
        print("Status Code:", response.status_code)
        
        # Verify DB
        invoice.refresh_from_db()
        print(f"New Grand Total: {invoice.grand_total}")
        
        # Verify Audit
        revisions = DocumentRevisionV2.objects.filter(object_id=invoice.id).order_by('-created_at')
        print(f"Revisions Count: {revisions.count()}")
        if revisions.exists():
            rev = revisions.first()
            print(f"Revision Action: {rev.action}")
            print(f"Revision Reason: {rev.reason_code} - {rev.reason_text}")
            print(f"Revision Diff Keys: {list(rev.diff_summary_json.keys())}")
            
    except Exception as e:
        traceback.print_exc()

if __name__ == '__main__':
    test_revise()
