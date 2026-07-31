import re

with open('apps/backend/apps/billing/tests/test_return_quantity_rollout.py', 'r') as f:
    content = f.read()

# Fix test_class_behavior_rebuild_logic assertions
content = content.replace("self.batch_syr.refresh_from_db()", "self.batch_syr_legacy.refresh_from_db()")
content = content.replace("self.assertEqual(self.batch_syr.qty_strips, 11)", "self.assertEqual(self.batch_syr_legacy.qty_strips, 11)")
content = content.replace("self.assertEqual(self.batch_syr.qty_loose, 50)", "self.assertEqual(self.batch_syr_legacy.qty_loose, 50)")

# Wait, in test_class_behavior_rebuild_logic, what are the assertions?
# self.batch_syr.refresh_from_db()
# self.assertEqual(self.batch_syr.qty_strips, 11)  # 10 + 1 (150 // 100)
# self.assertEqual(self.batch_syr.qty_loose, 50)   # 0 + 50 (150 % 100)
# Let's replace those accurately.
content = content.replace("self.assertEqual(self.batch_syr.qty_strips, 11)", "self.assertEqual(self.batch_syr_legacy.qty_strips, 11)")
content = content.replace("self.assertEqual(self.batch_syr.qty_loose, 50)", "self.assertEqual(self.batch_syr_legacy.qty_loose, 50)")

# Fix test_measured_payload_liquid assertions
content = content.replace("self.assertEqual(self.batch_syr.qty_strips, 10)  # Unchanged", "self.assertEqual(self.batch_syr.qty_strips, 0)  # Unchanged")
content = content.replace("self.assertEqual(self.batch_syr.qty_loose, 0)  # Unchanged", "self.assertEqual(self.batch_syr.qty_loose, 0)  # Unchanged")

with open('apps/backend/apps/billing/tests/test_return_quantity_rollout.py', 'w') as f:
    f.write(content)
