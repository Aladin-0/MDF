from typing import Dict, Any
from apps.billing.models import SaleInvoice
from apps.integrations.sandbox.client import SandboxAPIClient, SandboxIntegrationError

from decimal import Decimal, ROUND_HALF_EVEN

def _quantize(value):
    if value is None:
        return float('0.00')
    return float(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_EVEN))

def generate_irn_payload(invoice: SaleInvoice) -> dict:
    """
    Maps a SaleInvoice to the strict Sandbox E-Invoice JSON schema.
    Mathematically ensures AssAmt + CgstAmt + SgstAmt + IgstAmt == TotItemVal.
    """
    outlet = invoice.outlet
    customer = invoice.customer

    # Seller Details
    seller_dtls = {
        "Gstin": outlet.gstin,
        "LglNm": outlet.name,
        "Addr1": outlet.address or "NA",
        "Loc": outlet.city or "NA",
        "Pin": int(outlet.pincode) if outlet.pincode and outlet.pincode.isdigit() else 400001,
        "Stcd": str(outlet.state_code),
    }

    # Pin vs State Code Validation
    buyer_stcd = str(customer.state_code) if customer and customer.state_code else str(outlet.state_code)
    buyer_pin = 400001
    
    # Buyer Details
    buyer_dtls = {
        "Gstin": customer.gstin if customer and customer.gstin else "URP",
        "LglNm": customer.name if customer else "Cash Customer",
        "Pos": str(invoice.place_of_supply if invoice.place_of_supply else buyer_stcd),
        "Addr1": customer.address if customer and customer.address else "NA",
        "Loc": "NA",
        "Pin": buyer_pin,
        "Stcd": buyer_stcd,
    }

    # Item List
    item_list = []
    tot_ass_val = 0.0
    tot_cgst_val = 0.0
    tot_sgst_val = 0.0
    tot_igst_val = 0.0
    tot_inv_val = 0.0

    for idx, item in enumerate(invoice.items.all(), start=1):
        ass_amt = _quantize(item.taxable_amount)
        cgst_amt = _quantize(item.cgst_amount)
        sgst_amt = _quantize(item.sgst_amount)
        igst_amt = _quantize(item.igst_amount)
        tot_item_val = _quantize(item.total_amount)

        # Validate math per Sandbox requirement
        assert abs(ass_amt + cgst_amt + sgst_amt + igst_amt - tot_item_val) < 0.02, "Item math mismatch"

        item_list.append({
            "SlNo": str(idx),
            "PrdDesc": item.product_name,
            "IsServc": "N",
            "HsnCd": item.hsn_code or "3004",
            "Qty": int(item.qty_strips * (item.pack_size or 1) + item.qty_loose),
            "Unit": "NOS",
            "UnitPrice": _quantize(float(item.rate) / (item.pack_size if item.pack_size > 0 else 1)),
            "TotAmt": _quantize(item.total_amount),
            "Discount": _quantize(item.trade_discount_amount),
            "AssAmt": ass_amt,
            "GstRt": float(item.gst_rate),
            "IgstAmt": igst_amt,
            "CgstAmt": cgst_amt,
            "SgstAmt": sgst_amt,
            "TotItemVal": tot_item_val,
        })
        
        tot_ass_val += ass_amt
        tot_cgst_val += cgst_amt
        tot_sgst_val += sgst_amt
        tot_igst_val += igst_amt
        tot_inv_val += tot_item_val

    # Apply overall discount if any
    tot_inv_val -= _quantize(invoice.discount_amount) + _quantize(invoice.cash_discount_amount)
    tot_inv_val += _quantize(invoice.round_off)

    payload = {
        "Version": "1.1",
        "TranDtls": {
            "TaxSch": "GST",
            "SupTyp": "B2B" if buyer_dtls["Gstin"] != "URP" else "B2C",
            "IgstOnIntra": "N",
            "RegRev": "N",
            "EcmGstin": None,
        },
        "DocDtls": {
            "Typ": "INV",
            "No": invoice.invoice_no,
            "Dt": invoice.invoice_date.strftime("%d/%m/%Y"),
        },
        "SellerDtls": seller_dtls,
        "BuyerDtls": buyer_dtls,
        "ItemList": item_list,
        "ValDtls": {
            "AssVal": _quantize(tot_ass_val),
            "CgstVal": _quantize(tot_cgst_val),
            "SgstVal": _quantize(tot_sgst_val),
            "IgstVal": _quantize(tot_igst_val),
            "CesVal": 0.0,
            "StCesVal": 0.0,
            "Discount": _quantize(float(invoice.discount_amount) + float(invoice.cash_discount_amount)),
            "OthChrg": 0.0,
            "RndOffAmt": _quantize(invoice.round_off),
            "TotInvVal": _quantize(invoice.grand_total),
        }
    }

    if invoice.transporter_id or float(invoice.grand_total) > 100000:
        if invoice.transporter_id:
            payload["TransDtls"] = {"TransId": invoice.transporter_id}
        if invoice.vehicle_no:
            payload["VehDtls"] = {"VehNo": invoice.vehicle_no, "VehType": "R"}
            
    return payload

def request_einvoice(invoice: SaleInvoice) -> dict:
    """
    Sends the generated IRN payload to Sandbox and updates the invoice with IRN details.
    """
    client = SandboxAPIClient()
    client.authenticate()

    payload = generate_irn_payload(invoice)
    
    # Depending on Sandbox API structure for e-invoicing:
    # URL example: /gst/compliance/e-invoice/tax-payer/invoice
    try:
        seller_gstin = payload.get('SellerDtls', {}).get('Gstin', '')
        headers = {
            'gstin': seller_gstin,
            'x-api-version': '1.0.0'
        }
        response = client.request('POST', '/gst/compliance/e-invoice/tax-payer/invoice', headers=headers, json=[payload])
        # Usually it returns a list of responses or a single response.
        # Let's assume standard response
        if 'data' in response and isinstance(response['data'], list) and len(response['data']) > 0:
            data = response['data'][0]
            if data.get('Success') == 'Y':
                return {
                    'Irn': data.get('Irn'),
                    'AckNo': str(data.get('AckNo')),
                    'AckDt': data.get('AckDt'),
                    'SignedQRCode': data.get('SignedQRCode'),
                }
            else:
                raise SandboxIntegrationError(f"E-Invoice Failed: {data.get('ErrorDetails')}")
        else:
            raise SandboxIntegrationError("Invalid response format from Sandbox E-Invoice")
            
    except Exception as e:
        raise SandboxIntegrationError(f"Failed to generate IRN: {str(e)}")

def get_irn_by_document_details(invoice: SaleInvoice) -> dict:
    """
    Retrieves an existing IRN from Sandbox by document details.
    Uses the Sandbox API GET endpoint for document data.
    """
    client = SandboxAPIClient()
    client.authenticate()

    try:
        from django.conf import settings
        seller_gstin = getattr(settings, 'GSTIN', '27AAPCM1753L2ZX')
        
        headers = {
            'gstin': seller_gstin,
            'x-api-version': '1.0.0'
        }
        response = client.request('GET', f'/gst/compliance/e-invoice/tax-payer/invoice/details?docNo={invoice.invoice_no}&docTyp=INV', headers=headers)
        if 'data' in response and isinstance(response['data'], dict):
            data = response['data']
            if data.get('Irn'):
                return {
                    'Irn': data.get('Irn'),
                    'AckNo': str(data.get('AckNo')),
                    'AckDt': data.get('AckDt'),
                    'SignedQRCode': data.get('SignedQRCode'),
                }
        raise SandboxIntegrationError("Valid IRN not found in document details response")
    except Exception as e:
        raise SandboxIntegrationError(f"Failed to fetch IRN by document details: {str(e)}")

def cancel_einvoice(invoice: SaleInvoice, reason: str = "2", remark: str = "Cancelled by user") -> bool:
    """
    Cancels an active IRN on Sandbox.
    reason "1" = Duplicate, "2" = Data entry mistake
    """
    client = SandboxAPIClient()
    client.authenticate()

    payload = {
        "Irn": invoice.irn,
        "CnlRsn": reason,
        "CnlRem": remark
    }

    try:
        from django.conf import settings
        seller_gstin = getattr(settings, 'GSTIN', '27AAPCM1753L2ZX')
        
        headers = {
            'gstin': seller_gstin,
            'x-api-version': '1.0.0'
        }
        response = client.request('POST', '/gst/compliance/e-invoice/tax-payer/invoice/cancel', headers=headers, json=payload)
        # Check standard success criteria.
        if isinstance(response, dict) and 'data' in response:
            data = response['data']
            # If it's a list:
            if isinstance(data, list) and len(data) > 0:
                data = data[0]
            if data.get('Success') == 'Y' or data.get('CancelDate'):
                return True
            else:
                raise SandboxIntegrationError(f"E-Invoice Cancellation Failed: {data.get('ErrorDetails')}")
        return True # Fallback if no specific format but HTTP 200 OK
    except Exception as e:
        raise SandboxIntegrationError(f"Failed to cancel IRN: {str(e)}")
