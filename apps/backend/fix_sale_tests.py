import sys

def fix_tests():
    with open('apps/billing/tests/test_sale_edit_migration.py', 'r') as f:
        content = f.read()

    # 1. Fix event_name -> action
    t1 = 'event_name="cancel_and_reissue"'
    r1 = 'action="cancel_and_reissue"'
    if t1 in content:
        content = content.replace(t1, r1)
        print("Fixed t1")

    # 2. Fix mock target
    t2 = "@patch('apps.audit.core.orchestrator.record_mutation')"
    r2 = "@patch('apps.audit.core.orchestrator.record_revision')"
    if t2 in content:
        content = content.replace(t2, r2)
        print("Fixed t2")

    # 3. Add debug output to history api read path
    t3 = """        self.assertIn('revisions', response.data)
        self.assertEqual(len(response.data['revisions']), 1)"""
    r3 = """        self.assertIn('revisions', response.data)
        from apps.audit.models import DocumentRevisionV2
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(self.invoice)
        revs = DocumentRevisionV2.objects.filter(content_type=ct, object_id=str(self.invoice.id), tenant_id=self.outlet.id)
        if len(response.data['revisions']) != 1:
            print("REVS IN DB:", revs)
            print("CT:", ct.id)
            print("OBJECT_ID:", str(self.invoice.id))
            print("TENANT_ID:", self.outlet.id)
        self.assertEqual(len(response.data['revisions']), 1)"""
    
    if t3 in content:
        content = content.replace(t3, r3)
        print("Fixed t3")
        
    t4 = """        self.assertIn('revisions', response.data)
        self.assertEqual(len(response.data['revisions']), 1)"""
    r4 = """        self.assertIn('revisions', response.data)
        self.assertEqual(len(response.data['revisions']), 1)"""
    if t4 in content:
        content = content.replace(t4, r4)
        print("Fixed t4")

    with open('apps/billing/tests/test_sale_edit_migration.py', 'w') as f:
        f.write(content)

fix_tests()
