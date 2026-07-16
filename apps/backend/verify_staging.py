import requests
import json
import uuid

API_URL = "http://localhost:8000/api/v1"

print("--- Staging Verification Pass ---")

# 1. Empty items invoice
print("\n1. Empty Items Invoice:")
res = requests.post(f"{API_URL}/sales/", json={"items": []})
print(f"Status: {res.status_code}")
print(f"Response: {res.text}")

# 2. Revisions valid JSON
print("\n2. Revisions Valid JSON:")
res = requests.get(f"{API_URL}/sales/invalid-uuid/revisions/")
print(f"Status: {res.status_code}")
print(f"Content-Type: {res.headers.get('Content-Type')}")
print(f"Response: {res.text}")

# 3. Direct revise on paid bill
print("\n3. Revise non-existent or invalid bill:")
res = requests.post(f"{API_URL}/sales/{uuid.uuid4()}/revise/", json={})
print(f"Status: {res.status_code}")
print(f"Response: {res.text}")

