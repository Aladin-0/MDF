import requests

url = "http://localhost:8000/api/v1/auth/login/"
resp = requests.post(url, json={"phone": "9999999991", "password": "password123"})
if resp.status_code != 200:
    print("Login failed:", resp.text)
    exit(1)
token = resp.json().get("access")
if not token:
    print("No access token!")
    exit(1)

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

resp = requests.get("http://localhost:8000/api/v1/core/outlets/", headers=headers)
outlet_id = resp.json()[0]['id']

resp = requests.get(f"http://localhost:8000/api/v1/purchases/batches/?outlet={outlet_id}", headers=headers)
batch = resp.json()[0]

payload = {
    "outletId": outlet_id,
    "items": [{
        "batchId": batch['id'],
        "productId": batch['product'],
        "qtyStrips": 1,
        "qtyLoose": 0,
        "rate": 100.0,
        "discountPct": 0,
        "gstRate": 5,
        "taxableAmount": 95.24,
        "gstAmount": 4.76,
        "totalAmount": 100.0,
        "name": "Test Product",
        "batchNo": batch['batch_no'],
        "expiryDate": batch['expiry_date'],
        "saleMode": "strip",
        "packSize": 10,
        "scheduleType": "OTC"
    }],
    "subtotal": 100.0,
    "discountAmount": 0,
    "taxableAmount": 95.24,
    "cgstAmount": 2.38,
    "sgstAmount": 2.38,
    "igstAmount": 0,
    "cgst": 2.38,
    "sgst": 2.38,
    "igst": 0,
    "roundOff": 0.0,
    "grandTotal": 100.0,
    "paymentMode": "cash",
    "cashPaid": 100.0,
    "upiPaid": 0,
    "cardPaid": 0,
    "creditGiven": 0,
    "prescriptionNo": ""
}

resp = requests.post("http://localhost:8000/api/v1/sales/", json=payload, headers=headers)
print("STATUS:", resp.status_code)
# The text will contain HTML if 500
with open("traceback_output.html", "w") as f:
    f.write(resp.text)
print("Wrote response to traceback_output.html")
