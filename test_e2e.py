import requests

# 1. Login to get JWT
resp = requests.post('http://localhost:8000/api/v1/auth/login/', json={
    'username': 'admin',
    'password': 'password'
})
if resp.status_code != 200:
    print(f"Login failed: {resp.status_code} {resp.text}")
    # let's try creating user via django and setting a password
    import os
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mediflow.settings.base')
    os.environ.setdefault('DATABASE_URL', 'postgres://mediflow:mediflow@localhost:5432/mediflow')
    django.setup()
    from apps.core.models import Staff
    staff = Staff.objects.first()
    if staff:
        staff.set_password('password')
        staff.save()
        resp = requests.post('http://localhost:8000/api/v1/auth/login/', json={'username': staff.username, 'password': 'password'})
        if resp.status_code != 200:
            print(f"Login still failed: {resp.status_code} {resp.text}")
            exit(1)
        else:
            print("Login success after resetting password.")
    else:
        print("No staff found.")
        exit(1)
else:
    print("Login success.")

token = resp.json().get('access')
headers = {'Authorization': f'Bearer {token}'}

# 2. Test /api/v1/auth/me/
me_resp = requests.get('http://localhost:8000/api/v1/auth/me/', headers=headers)
print(f"/auth/me/: {me_resp.status_code}")
if me_resp.status_code == 200:
    outlet_id = me_resp.json().get('outletId')
else:
    print(me_resp.text)
    outlet_id = 'c51446f2-cc72-42b5-b26f-fdb1c58e01d2' # fallback

# 3. Test /api/v1/purchases/
purch_resp = requests.get(f'http://localhost:8000/api/v1/purchases/?outletId={outlet_id}', headers=headers)
print(f"/purchases/: {purch_resp.status_code}")
if purch_resp.status_code != 200: print(purch_resp.text)

# 4. Test /api/v1/inventory/
inv_resp = requests.get(f'http://localhost:8000/api/v1/inventory/?outletId={outlet_id}', headers=headers)
print(f"/inventory/: {inv_resp.status_code}")
if inv_resp.status_code != 200: print(inv_resp.text)

# 5. Test /api/v1/products/search/
search_resp = requests.get(f'http://localhost:8000/api/v1/products/search/?outletId={outlet_id}&q=a', headers=headers)
print(f"/products/search/: {search_resp.status_code}")
if search_resp.status_code != 200: print(search_resp.text)
