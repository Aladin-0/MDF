import urllib.request
import urllib.error
import json
import uuid

def fetch(url, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8') if data else None, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')

status, data = fetch('http://localhost:8000/api/v1/auth/token/', {'phone': '9999999999', 'password': 'test_password'})
if status != 200:
    status, data = fetch('http://localhost:8000/api/v1/auth/token/', {'phone': '9999999999', 'password': 'password'})
token = data['access']

status, outlets = fetch('http://localhost:8000/api/v1/core/outlets/', token=token)
outlet = outlets[0]
outlet_id = outlet['id']

status, batches_data = fetch(f'http://localhost:8000/api/v1/inventory/batches/?outletId={outlet_id}', token=token)
batch = batches_data['results'][0]

payload = {
    "outletId": outlet_id,
    "items": [{
        "batchId": batch['id'],
        "productId": batch['productId'],
        "qtyStrips": 1,
        "qtyLoose": 0,
        "rate": float(batch['saleRate']),
        "discountPct": 0,
        "gstRate": 5,
        "taxableAmount": float(batch['saleRate']),
        "gstAmount": 0,
        "totalAmount": float(batch['saleRate'])
    }],
    "subtotal": float(batch['saleRate']),
    "discountAmount": 0,
    "taxableAmount": float(batch['saleRate']),
    "cgstAmount": 0,
    "sgstAmount": 0,
    "igstAmount": 0,
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "roundOff": 0,
    "grandTotal": float(batch['saleRate']),
    "paymentMode": "cash",
    "cashPaid": float(batch['saleRate']),
    "upiPaid": 0,
    "cardPaid": 0,
    "creditGiven": 0
}

status, res = fetch('http://localhost:8000/api/v1/sales/', payload, token)
print(f"Status: {status}")
print(f"Response: {res}")
