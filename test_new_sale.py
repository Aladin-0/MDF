import requests
import json
import uuid

# Get auth token
r = requests.post("http://localhost:8000/api/v1/auth/token/", json={
    "phone": "9999999991",
    "password123": "password123"
})
token = r.json().get('access')

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Find an outlet and a batch
r = requests.get("http://localhost:8000/api/v1/core/outlets/", headers=headers)
outlet_id = r.json()[0]['id']

r = requests.get(f"http://localhost:8000/api/v1/inventory/batches/?outletId={outlet_id}", headers=headers)
batch = r.json()['results'][0]

payload = {
    "outletId": outlet_id,
    "items": [
        {
            "batchId": batch['id'],
            "productId": batch['productId'],
            "qtyStrips": 1,
            "qtyLoose": 0,
            "rate": batch['saleRate'],
            "discountPct": 0,
            "gstRate": 5,
            "taxableAmount": batch['saleRate'],
            "gstAmount": 0,
            "totalAmount": batch['saleRate']
        }
    ],
    "subtotal": batch['saleRate'],
    "discountAmount": 0,
    "taxableAmount": batch['saleRate'],
    "cgstAmount": 0,
    "sgstAmount": 0,
    "igstAmount": 0,
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "roundOff": 0,
    "grandTotal": batch['saleRate'],
    "paymentMode": "cash",
    "cashPaid": batch['saleRate'],
    "upiPaid": 0,
    "cardPaid": 0,
    "creditGiven": 0
}

r = requests.post("http://localhost:8000/api/v1/sales/", headers=headers, json=payload)
print(f"Status: {r.status_code}")
print(r.text)

