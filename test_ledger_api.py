import requests

BASE_URL = "http://localhost:8000/api/v1"

# 1. Login to get token
r = requests.post(f"{BASE_URL}/users/token/", json={"phone": "9421981370", "password": "password"})
token = r.json()["access"]
headers = {"Authorization": f"Bearer {token}"}

payload = {
    "outletId": 1,
    "name": "Test Customer Modal",
    "groupId": "some-uuid", # We need a real group id
    "openingBalance": 0,
    "balanceType": "Dr",
    "balancingMethod": "bill_by_bill",
    "phone": "1234567890",
    "gstin": "",
    "address": "test addr"
}

# Fetch groups
g_res = requests.get(f"{BASE_URL}/ledgers/groups/?outletId=1", headers=headers)
groups = g_res.json()
sundry_debtors = next((g for g in groups if "debtor" in g["name"].lower()), None)

if sundry_debtors:
    payload["groupId"] = sundry_debtors["id"]
    res = requests.post(f"{BASE_URL}/ledgers/", json=payload, headers=headers)
    print(f"Status: {res.status_code}")
    print(res.json())
else:
    print("Could not find Sundry Debtors group")

