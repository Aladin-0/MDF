import re

with open("apps/backend/apps/purchases/revision_service.py", "r") as f:
    content = f.read()

diff_func = """
def compute_purchase_revision_diff(old_snapshot, new_snapshot):
    diff = {
        'financial': {},
        'header': {},
        'items_added': [],
        'items_removed': [],
        'items_modified': []
    }
    
    financial_fields = ['grand_total', 'subtotal', 'taxable_amount', 'amount_paid', 'outstanding', 'discount_amount', 'gst_amount', 'cess_amount']
    for field in financial_fields:
        old_val = old_snapshot.get(field, '0')
        new_val = new_snapshot.get(field, '0')
        if str(old_val) != str(new_val):
            diff['financial'][field] = {'old': str(old_val), 'new': str(new_val)}

    header_fields = ['distributor_id', 'invoice_no', 'invoice_date', 'purchase_type', 'godown']
    for field in header_fields:
        old_val = old_snapshot.get(field)
        new_val = new_snapshot.get(field)
        if str(old_val) != str(new_val):
            diff['header'][field] = {'old': str(old_val), 'new': str(new_val)}
            
    old_items = {item['id']: item for item in old_snapshot.get('items', [])}
    new_items = {item['id']: item for item in new_snapshot.get('items', []) if 'id' in item}
    
    for item_id, old_item in old_items.items():
        if item_id not in new_items:
            diff['items_removed'].append(old_item)
        else:
            new_item = new_items[item_id]
            item_diff = {}
            for k, v in old_item.items():
                if str(v) != str(new_item.get(k)):
                    item_diff[k] = {'old': str(v), 'new': str(new_item.get(k))}
            if item_diff:
                diff['items_modified'].append({
                    'item_id': item_id,
                    'changes': item_diff
                })
                
    for item_id, new_item in new_items.items():
        if item_id not in old_items:
            diff['items_added'].append(new_item)
            
    return diff
"""

content = content.replace("def create_purchase_revision_record(", diff_func + "\ndef create_purchase_revision_record(")

# Inject diff_summary_json
content = content.replace(
    "old_snapshot_json=old_snapshot,\n        new_snapshot_json=new_snapshot,",
    "old_snapshot_json=old_snapshot,\n        new_snapshot_json=new_snapshot,\n        diff_summary_json=compute_purchase_revision_diff(old_snapshot, new_snapshot),"
)

with open("apps/backend/apps/purchases/revision_service.py", "w") as f:
    f.write(content)

print("Patched successfully")
