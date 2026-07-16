from django.test import TestCase
from apps.audit.core.diff_engine import DiffEngine

class DiffEngineTests(TestCase):
    def test_flat_voucher_diff(self):
        old_snap = {
            "total_amount": "200.00",
            "narration": "old text",
            "updated_at": "2024-01-01T00:00:00Z"
        }
        new_snap = {
            "total_amount": "300.00",
            "narration": "new text",
            "updated_at": "2024-01-02T00:00:00Z"
        }
        
        diff = DiffEngine.compute_diff("Voucher", old_snap, new_snap)
        
        # Should ignore updated_at
        self.assertNotIn("updated_at", diff)
        
        # Should format money properly
        self.assertEqual(diff["total_amount"]["old"], "200.00")
        self.assertEqual(diff["total_amount"]["new"], "300.00")
        
        # Should catch narration
        self.assertEqual(diff["narration"]["old"], "old text")
        self.assertEqual(diff["narration"]["new"], "new text")

    def test_nested_invoice_diff(self):
        old_snap = {
            "header": {"status": "draft"},
            "financial": {"subtotal": "10.00"},
            "items": [
                {"id": "item1", "product_name": "Paracetamol", "qty": 1, "total_amount": "10.00"}
            ]
        }
        new_snap = {
            "header": {"status": "applied"},
            "financial": {"subtotal": "20.00"},
            "items": [
                {"id": "item1", "product_name": "Paracetamol", "qty": 2, "total_amount": "20.00"}
            ]
        }
        
        diff = DiffEngine.compute_diff("SaleInvoice", old_snap, new_snap)
        
        self.assertEqual(diff["header"]["status"]["old"], "draft")
        self.assertEqual(diff["header"]["status"]["new"], "applied")
        
        self.assertEqual(diff["financial"]["subtotal"]["old"], "10.00")
        self.assertEqual(diff["financial"]["subtotal"]["new"], "20.00")
        
        self.assertEqual(len(diff["items_modified"]), 1)
        self.assertEqual(diff["items_modified"][0]["id"], "item1")
        self.assertEqual(diff["items_modified"][0]["changes"]["qty"]["old"], 1)
        self.assertEqual(diff["items_modified"][0]["changes"]["qty"]["new"], 2)
        self.assertEqual(diff["items_modified"][0]["changes"]["total_amount"]["old"], "10.00")
        self.assertEqual(diff["items_modified"][0]["changes"]["total_amount"]["new"], "20.00")
        
        self.assertEqual(len(diff["items_added"]), 0)
        self.assertEqual(len(diff["items_removed"]), 0)
