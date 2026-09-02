import re

with open('apps/billing/tests/test_revise_api.py', 'r') as f:
    content = f.read()

content = content.replace("self.assertEqual(revision.new_snapshot_json['grand_total'], '180.00')", "print('DEBUG_SNAP:', revision.new_snapshot_json)\n        self.assertEqual(revision.new_snapshot_json.get('grand_total'), '180.00')")
content = content.replace("self.assertEqual(str(revision.resulting_document_id), str(new_invoice.id))", "print('DEBUG_DIFF:', revision.diff_summary_json)\n        self.assertEqual(str(revision.diff_summary_json.get('resulting_document_id')), str(new_invoice.id))")

with open('apps/billing/tests/test_revise_api.py', 'w') as f:
    f.write(content)

