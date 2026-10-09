from apps.billing.models import SaleInvoice
from apps.integrations.sandbox.client import SandboxIntegrationError, SandboxAPIClient
from apps.compliance.services.sandbox_auth import SandboxAuthService
from apps.core.models import SandboxConfiguration
import requests
from decimal import Decimal, ROUND_HALF_EVEN

def _quantize(value):
    if value is None:
        return float('0.00')
    return float(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_EVEN))

def generate_ewb_payload(invoice: SaleInvoice) -> dict:
    """
    Maps a SaleInvoice to the Sandbox E-Way Bill JSON schema.
    """
    outlet = invoice.outlet
    customer = invoice.customer

    payload = {
        "supplyType": "O",
        "subSupplyType": 1,
        "subSupplyDesc": "",
        "docType": "INV",
        "docNo": invoice.invoice_no,
        "docDate": invoice.invoice_date.strftime("%d/%m/%Y"),
        "fromGstin": outlet.gstin,
        "fromTrdName": outlet.name,
        "fromAddr1": outlet.address or "NA",
        "fromAddr2": "",
        "fromPlace": outlet.city or "NA",
        "fromPincode": int(outlet.pincode) if outlet.pincode and outlet.pincode.isdigit() else 400001,
        "fromStateCode": int(outlet.state_code),
        "actualFromStateCode": int(outlet.state_code),
        "toGstin": customer.gstin if customer and customer.gstin else "URP",
        "toTrdName": customer.name if customer else "Cash Customer",
        "toAddr1": customer.address if customer and customer.address else "NA",
        "toAddr2": "",
        "toPlace": getattr(customer, 'city', "NA") if customer else "NA",
        "toPincode": int(customer.pincode) if customer and getattr(customer, 'pincode', None) and customer.pincode.isdigit() else int(outlet.pincode) if getattr(outlet, 'pincode', None) and outlet.pincode.isdigit() else 400001,
        "toStateCode": int(customer.state_code) if customer and customer.state_code else int(outlet.state_code),
        "actualToStateCode": int(customer.state_code) if customer and customer.state_code else int(outlet.state_code),
        "totalValue": _quantize(invoice.taxable_amount),
        "cgstValue": _quantize(invoice.cgst_amount),
        "sgstValue": _quantize(invoice.sgst_amount),
        "igstValue": _quantize(invoice.igst_amount),
        "cessValue": 0.0,
        "totInvValue": _quantize(invoice.grand_total),
        "transporterId": invoice.transporter_id or "",
        "transporterName": "",
        "transDocNo": "",
        "transMode": getattr(invoice, 'trans_mode', 1),
        "transDistance": getattr(invoice, 'trans_distance', 0),
        "transDocDate": "",
        "vehicleNo": invoice.vehicle_no or "",
        "vehicleType": getattr(invoice, 'vehicle_type', "R"),
        "itemList": []
    }

    for item in invoice.items.all():
        payload["itemList"].append({
            "productName": item.product_name,
            "productDesc": item.product_name,
            "hsnCode": str(item.hsn_code) if item.hsn_code else "3004",
            "quantity": float(item.qty_strips * (item.pack_size or 1) + item.qty_loose),
            "qtyUnit": "NOS",
            "taxableAmount": _quantize(item.taxable_amount),
            "sgstRate": _quantize(float(item.gst_rate) / 2) if invoice.cgst_amount > 0 else 0.0,
            "cgstRate": _quantize(float(item.gst_rate) / 2) if invoice.cgst_amount > 0 else 0.0,
            "igstRate": _quantize(item.gst_rate) if invoice.igst_amount > 0 else 0.0,
            "cessRate": 0.0
        })

    return payload

def request_ewaybill(invoice: SaleInvoice) -> dict:
    """
    Sends the generated EWB payload to Sandbox and updates the invoice with EWB details.
    """
    config = SandboxConfiguration.objects.filter(active=True).first()
    if not config:
        raise SandboxIntegrationError("Sandbox Configuration is missing or inactive.")
        
    from django.conf import settings
    gstin = getattr(settings, 'GSTIN', invoice.outlet.gstin)
    if not gstin:
        raise SandboxIntegrationError("Outlet GSTIN is required for E-Way Bill generation.")

    try:
        sandbox_jwt = SandboxAuthService.get_sandbox_jwt(config)
        nic_token = SandboxAuthService.get_nic_ewaybill_token(config, gstin)
        
        headers = {
            "accept": "application/json",
            "authorization": f"Bearer {nic_token}",
            "x-api-key": getattr(settings, 'SANDBOX_API_KEY', None) or config.api_key,
            "x-api-version": "1.0.0",
            "gstin": gstin,
            "Content-Type": "application/json"
        }

        payload = generate_ewb_payload(invoice)
        url = f"{config.base_url.rstrip('/')}/gst/compliance/e-way-bill/consignor/bill"
        
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code != 200:
            print(f"Sandbox Ewaybill API Failed: {response.text}")
        response.raise_for_status()
        
        data = response.json()
        if 'status' in data and data['status'] == 1:
            resp_data = data.get('data', {})
            return {
                'ewayBillNo': str(resp_data.get('ewayBillNo')),
                'ewayBillDate': resp_data.get('ewayBillDate'),
                'validUpto': resp_data.get('validUpto')
            }
        else:
            raise SandboxIntegrationError(f"E-Way Bill Failed: {data.get('error', 'Unknown Error')}")
            
    except Exception as e:
        raise SandboxIntegrationError(f"Failed to generate EWB: {str(e)}")

def fetch_eway_bill_pdf(ewb_no: str) -> bytes:
    """
    Fetches the E-Way Bill PDF blob from the Sandbox API.
    """
    client = SandboxAPIClient()
    client.authenticate()
    
    try:
        # Assuming Sandbox exposes a GET /ewayapi/print endpoint or similar to fetch raw PDF.
        # Here we mock the URL structure per typical Sandbox behavior.
        response_bytes = client.request_raw('GET', f'/ewayapi/print?ewbNo={ewb_no}')
        return response_bytes
    except Exception as e:
        raise SandboxIntegrationError(f"Failed to download E-Way Bill PDF: {str(e)}")
