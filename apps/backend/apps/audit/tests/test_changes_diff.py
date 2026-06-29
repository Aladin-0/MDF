from django.test import override_settings
from django.test import TestCase
from .factories import make_staff, make_product, get_latest_log

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ChangesDiffTests(TestCase):
    def setUp(self):
        self.staff = make_staff()

    def test_update_log_has_old_and_new(self):
        product = make_product(name="Before")
        product._audit_user = self.staff
        product.save()
        
        product.name = "After"
        product._audit_user = self.staff
        product.save()
        
        log = get_latest_log(action="UPDATE", module="inventory", entity_type="MasterProduct")
        self.assertIn("name", log.changes_json)
        self.assertEqual(log.changes_json["name"]["old"], "Before")
        self.assertEqual(log.changes_json["name"]["new"], "After")

    def test_unchanged_fields_not_in_diff(self):
        product = make_product(name="Same")
        product._audit_user = self.staff
        product.save()
        
        product.gst_rate = 18.0
        product._audit_user = self.staff
        product.save()
        
        log = get_latest_log(action="UPDATE", module="inventory", entity_type="MasterProduct")
        self.assertNotIn("name", log.changes_json)
        self.assertIn("gst_rate", log.changes_json)

    def test_create_log_has_empty_or_null_changes(self):
        product = make_product(name="New Create")
        product._audit_user = self.staff
        product.save()
        
        log = get_latest_log(action="CREATE", module="inventory", entity_type="MasterProduct")
        # In registry.py: "changes[field] = {'old': None, 'new': str(val) if val is not None else None}"
        self.assertIn("name", log.changes_json)
        self.assertIsNone(log.changes_json["name"]["old"])
        self.assertEqual(log.changes_json["name"]["new"], "New Create")

    def test_delete_log_captures_entity_label(self):
        product = make_product(name="Delete Me")
        product._audit_user = self.staff
        product.save()
        
        product.delete()
        
        log = get_latest_log(action="DELETE", module="inventory", entity_type="MasterProduct")
        self.assertTrue("Delete Me" in log.entity_label)
        self.assertEqual(log.changes_json, {})

    def test_multiple_field_changes_all_in_diff(self):
        product = make_product(name="Old Name", outlet=self.staff.outlet)
        product._audit_user = self.staff
        product.save()
        
        product.name = "New Name"
        product.gst_rate = 5.0
        product._audit_user = self.staff
        product.save()
        
        log = get_latest_log(action="UPDATE", module="inventory", entity_type="MasterProduct")
        self.assertIn("name", log.changes_json)
        self.assertEqual(log.changes_json["name"]["old"], "Old Name")
        self.assertEqual(log.changes_json["name"]["new"], "New Name")
        
        self.assertIn("gst_rate", log.changes_json)
        self.assertEqual(log.changes_json["gst_rate"]["old"], "12.00") # default from factory
        self.assertEqual(log.changes_json["gst_rate"]["new"], "5.0")
