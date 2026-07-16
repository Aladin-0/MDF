from typing import Dict, Any

AUDIT_DIFF_CONFIG = {
    "Voucher": {
        "labels": {
            "date": "Voucher Date",
            "total_amount": "Total Amount",
            "narration": "Narration",
        },
        "ignore": ["updated_at", "last_printed_at"],
        "money_fields": ["total_amount"],
    },
    "SaleInvoice": {
        "labels": {
            "invoice_date": "Invoice Date",
            "subtotal": "Subtotal",
            "grand_total": "Grand Total",
            "taxable_amount": "Taxable Amount"
        },
        "ignore": ["updated_at"],
        "money_fields": ["subtotal", "grand_total", "taxable_amount", "amount_due", "total_amount"],
    },
    "PurchaseInvoice": {
        "labels": {
            "invoice_date": "Invoice Date",
            "subtotal": "Subtotal",
            "grand_total": "Grand Total",
            "gst_amount": "GST Amount",
            "outstanding": "Outstanding"
        },
        "ignore": ["updated_at"],
        "money_fields": ["subtotal", "grand_total", "gst_amount", "outstanding", "total_amount", "taxable_amount"],
    }
}

class DiffEngine:
    @staticmethod
    def _format_money(value: Any) -> str:
        if value is None:
            return None
        try:
            return f"{float(value):.2f}"
        except (ValueError, TypeError):
            return str(value)

    @staticmethod
    def _compare_flat_dict(old_dict: Dict, new_dict: Dict, money_fields: list, ignore_fields: list) -> Dict:
        diff = {}
        all_keys = set(old_dict.keys()).union(set(new_dict.keys()))
        for key in all_keys:
            if key in ignore_fields:
                continue
            old_val = old_dict.get(key)
            new_val = new_dict.get(key)
            
            # Format money fields for comparison
            if key in money_fields:
                old_val_fmt = DiffEngine._format_money(old_val) if old_val is not None else None
                new_val_fmt = DiffEngine._format_money(new_val) if new_val is not None else None
                if old_val_fmt != new_val_fmt:
                    diff[key] = {'old': old_val_fmt, 'new': new_val_fmt}
            else:
                if str(old_val) != str(new_val):
                    diff[key] = {'old': old_val, 'new': new_val}
        return diff

    @staticmethod
    def compute_diff(model_name: str, old_snapshot: Dict[str, Any], new_snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """
        Computes a backward-compatible diff summary json.
        """
        config = AUDIT_DIFF_CONFIG.get(model_name, {"labels": {}, "ignore": [], "money_fields": []})
        money_fields = config.get("money_fields", [])
        ignore_fields = config.get("ignore", [])
        
        diff = {}
        
        # We need to maintain backward compatibility with current diff structure.
        # Often it splits into "header", "financial", "items_modified" etc for invoices,
        # but for Voucher it's a flat dict.
        
        # If it's a flat voucher snapshot (has no 'header' or 'financial' grouping in legacy)
        # Actually, looking at the previous analysis report, voucher diffs were flat:
        # Diff: {"total_amount": {"new": "300", "old": "200.00"}}
        # But SaleInvoice/PurchaseInvoice diffs were nested:
        # Diff: {"header": {}, "financial": {"subtotal": {"new": "20.00", "old": "10.00"}, ...}, "items_added": [], "items_removed": [], "items_modified": [...]}
        
        if "header" in old_snapshot or "financial" in old_snapshot or "items" in old_snapshot:
            # Nested Invoice/Return style
            diff["header"] = DiffEngine._compare_flat_dict(
                old_snapshot.get("header", {}), new_snapshot.get("header", {}), money_fields, ignore_fields
            )
            diff["financial"] = DiffEngine._compare_flat_dict(
                old_snapshot.get("financial", {}), new_snapshot.get("financial", {}), money_fields, ignore_fields
            )
            
            # Items comparison
            old_items = {str(item.get("id")): item for item in old_snapshot.get("items", []) if item.get("id")}
            new_items = {str(item.get("id")): item for item in new_snapshot.get("items", []) if item.get("id")}
            
            items_added = []
            for item_id, item in new_items.items():
                if item_id not in old_items:
                    items_added.append(item)
                    
            items_removed = []
            for item_id, item in old_items.items():
                if item_id not in new_items:
                    items_removed.append(item)
                    
            items_modified = []
            for item_id, old_item in old_items.items():
                if item_id in new_items:
                    new_item = new_items[item_id]
                    item_diff = DiffEngine._compare_flat_dict(old_item, new_item, money_fields, ignore_fields)
                    if item_diff:
                        # Legacy diff included some base fields like product_name/name
                        items_modified.append({
                            "id": item_id,
                            "name": new_item.get("product_name") or new_item.get("name"),
                            "changes": item_diff
                        })
            
            diff["items_added"] = items_added
            diff["items_removed"] = items_removed
            diff["items_modified"] = items_modified
            
        else:
            # Flat Document style (like Voucher)
            diff = DiffEngine._compare_flat_dict(old_snapshot, new_snapshot, money_fields, ignore_fields)
            
        return diff
