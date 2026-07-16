import sys

def fix_tests():
    with open('apps/billing/tests/test_sale_edit_migration.py', 'r') as f:
        content = f.read()

    # Add HTTP_OUTLETID to client.put
    content = content.replace("self.client.put(url, data=payload, format='json')",
                              "self.client.put(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))")

    # Add HTTP_OUTLETID to client.post
    content = content.replace("self.client.post(url, data=payload, format='json')",
                              "self.client.post(url, data=payload, format='json', HTTP_OUTLETID=str(self.outlet.id))")
                              
    # Add HTTP_OUTLETID to client.get
    content = content.replace("self.client.get(url)",
                              "self.client.get(url, HTTP_OUTLETID=str(self.outlet.id))")

    with open('apps/billing/tests/test_sale_edit_migration.py', 'w') as f:
        f.write(content)

fix_tests()
