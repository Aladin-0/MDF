import requests
import json
import uuid

outlet_id = "d5349da2-dc06-405e-a5ee-6370c5e75c91" # From logs

payload = {
    "outletId": outlet_id,
    "doctorId": None,
    "doctorName": "Test Doctor",
    "hospitalName": "Test Hospital",
    "items": [],
    "subtotal": 0,
    "discountAmount": 0,
    "taxableAmount": 0,
    "cgstAmount": 0,
    "sgstAmount": 0,
    "igstAmount": 0,
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "cessAmount": 0,
    "roundOff": 0,
    "totalAmount": 0,
    "paidAmount": 0,
    "payments": []
}

resp = requests.post("http://localhost:8000/api/v1/sales/", json=payload)
print(resp.status_code)
print(resp.text)
