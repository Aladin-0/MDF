import requests

BASE_URL = "http://localhost:8000/api/v1"

# 1. Login to get token
r = requests.post(f"{BASE_URL}/users/token/", json={"phone": "9421981370", "password": "password"})
token = r.json()["access"]
headers = {"Authorization": f"Bearer {token}"}

# 2. Get customer
r = requests.get(f"{BASE_URL}/customers/", headers=headers)
customer_id = r.json()["results"][0]["id"]
print(f"Customer: {customer_id}")

# 3. Create invoice
payload = {
    "outletId": 1,
    "customer": customer_id,
    "items": [{
        "product": 1,
        "qtyStrips": 1,
        "qtyLoose": 0,
        "rate": 10,
        "mrp": 12,
    }],
    "amountPaid": 0
}
r = requests.post(f"{BASE_URL}/sales/", json=payload, headers=headers)
invoice_id = r.json()["id"]
print(f"Created Invoice: {invoice_id}")

# 4. Modify invoice date
r = requests.get(f"{BASE_URL}/sales/{invoice_id}/", headers=headers)
full_invoice = r.json()

update_payload = {
    "outletId": 1,
    "customer": customer_id,
    "items": full_invoice["items"],
    "amountPaid": 0,
    "invoiceDate": "2026-07-20T10:00:00Z"
}

r = requests.put(f"{BASE_URL}/sales/{invoice_id}/", json=update_payload, headers=headers)
print(f"Modify Status: {r.status_code}")

# 5. Verify persistence
r = requests.get(f"{BASE_URL}/sales/{invoice_id}/", headers=headers)
print(f"Persisted Date: {r.json().get('invoiceDate') or r.json().get('invoice_date')}")

