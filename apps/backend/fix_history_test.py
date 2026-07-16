import sys

def fix_tests():
    with open('apps/billing/tests/test_sale_edit_migration.py', 'r') as f:
        content = f.read()

    t = """        if len(response.data['revisions']) != 1:
            print("REVS IN DB:", revs)
            print("CT:", ct.id)
            print("OBJECT_ID:", str(self.invoice.id))
            print("TENANT_ID:", self.outlet.id)"""
    r = """        if len(response.data['revisions']) != 1:
            print("REVS IN DB:", revs)
            print("CT:", ct.id)
            print("OBJECT_ID:", str(self.invoice.id))
            print("TENANT_ID:", self.outlet.id)
            all_revs = DocumentRevisionV2.objects.all()
            for ar in all_revs:
                print(f"REV: id={ar.id}, ct={ar.content_type_id}, obj={ar.object_id}, tenant={ar.tenant_id}")"""

    if t in content:
        content = content.replace(t, r)
        print("Replaced print logic")
        
    with open('apps/billing/tests/test_sale_edit_migration.py', 'w') as f:
        f.write(content)

fix_tests()
