import re

with open("apps/backend/apps/purchases/services.py", "r") as f:
    content = f.read()

# Replace the previous validation code with the fixed one using str() for dates
old_code = """
        # --- Over-Consumption Validation ---
        # Map old items to their quantities
        old_batch_qtys = {}
        for old_item in old_items:
            if old_item.batch:
                bkey = (old_item.batch.batch_no, old_item.batch.expiry_date)
                old_batch_qtys[bkey] = {
                    'purchased': old_item.qty + old_item.free_qty,
                    'current_stock': old_item.batch.qty_strips
                }

        # Calculate new quantities from payload
        new_batch_qtys = {}
        for p_item in payload.get('items', []):
            bkey = (p_item.get('batchNo'), p_item.get('expiryDate'))
            new_qty = int(p_item.get('qty', 0)) + int(p_item.get('freeQty', 0))
            new_batch_qtys[bkey] = new_batch_qtys.get(bkey, 0) + new_qty

        # Validate that new_qty is not less than consumed_qty
        for bkey, qtys in old_batch_qtys.items():
            consumed = qtys['purchased'] - qtys['current_stock']
            if consumed > 0:
                new_qty = new_batch_qtys.get(bkey, 0)
                if new_qty < consumed:
                    raise PurchaseServiceError(f"Cannot reduce stock below already consumed quantity (consumed: {consumed}).")
"""

new_code = """
        # --- Over-Consumption Validation ---
        # Map old items to their quantities
        old_batch_qtys = {}
        for old_item in old_items:
            if old_item.batch:
                bkey = (old_item.batch.batch_no, str(old_item.batch.expiry_date)[:10] if old_item.batch.expiry_date else None)
                old_batch_qtys[bkey] = {
                    'purchased': old_item.qty + old_item.free_qty,
                    'current_stock': old_item.batch.qty_strips
                }

        # Calculate new quantities from payload
        new_batch_qtys = {}
        for p_item in payload.get('items', []):
            expiry = p_item.get('expiryDate')
            if expiry:
                expiry = str(expiry)[:10]  # Just take YYYY-MM-DD
            bkey = (p_item.get('batchNo'), expiry)
            new_qty = int(p_item.get('qty', 0)) + int(p_item.get('freeQty', 0))
            new_batch_qtys[bkey] = new_batch_qtys.get(bkey, 0) + new_qty

        # Validate that new_qty is not less than consumed_qty
        for bkey, qtys in old_batch_qtys.items():
            consumed = qtys['purchased'] - qtys['current_stock']
            if consumed > 0:
                new_qty = new_batch_qtys.get(bkey, 0)
                if new_qty < consumed:
                    raise PurchaseServiceError(f"stock error: Cannot reduce stock below already consumed quantity (consumed: {consumed}).")
"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("apps/backend/apps/purchases/services.py", "w") as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Old code not found! Patch failed.")
