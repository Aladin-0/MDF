import requests
import json

# Login
resp = requests.post('http://localhost:8000/api/v1/auth/login/', json={'phone': '9999999999', 'password': 'password123'})
token = resp.json().get('access')

headers = {'Authorization': f'Bearer {token}'}
# Fetch the debit note
resp2 = requests.get('http://localhost:8000/api/v1/debit-notes/0c19c0a9-6b34-4bae-9f8d-7f01c939d5cf/', headers=headers)
print("Status:", resp2.status_code)
print("Body:", json.dumps(resp2.json(), indent=2))
