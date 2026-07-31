import sys

with open("apps/backend/apps/purchases/views.py", "r") as f:
    content = f.read()

old_block1 = """            'pkg': item.pkg,
            'qty': item.qty,
            'actualQty': item.actual_qty,
            'freeQty': item.free_qty,
            'purchaseRate': float(item.purchase_rate),"""

new_block1 = """            'pkg': item.pkg,
            'qty': item.qty,
            'actualQty': item.actual_qty,
            'freeQty': item.free_qty,
            'qtyMeasured': float(item.qty_measured) if item.qty_measured is not None else None,
            'measuredUnit': item.measured_unit,
            'behaviorClass': getattr(item.master_product, 'behavior_class', 'TABLET_REBUILDABLE') if item.master_product else 'TABLET_REBUILDABLE',
            'purchaseRate': float(item.purchase_rate),"""

content = content.replace(old_block1, new_block1)

old_block2 = """                    'pkg': item.pkg,
                    'qty': item.qty,
                    'actualQty': item.actual_qty,
                    'freeQty': item.free_qty,
                    'purchaseRate': float(item.purchase_rate),"""

new_block2 = """                    'pkg': item.pkg,
                    'qty': item.qty,
                    'actualQty': item.actual_qty,
                    'freeQty': item.free_qty,
                    'qtyMeasured': float(item.qty_measured) if item.qty_measured is not None else None,
                    'measuredUnit': item.measured_unit,
                    'behaviorClass': getattr(item.master_product, 'behavior_class', 'TABLET_REBUILDABLE') if item.master_product else 'TABLET_REBUILDABLE',
                    'purchaseRate': float(item.purchase_rate),"""

content = content.replace(old_block2, new_block2)

old_block3 = """                    'pkg': item.pkg,
                    'qty': item.qty,
                    'availableQty': item.batch.qty_strips if item.batch else 0,
                    'freeQty': item.free_qty,
                    'purchaseRate': float(item.purchase_rate),"""

new_block3 = """                    'pkg': item.pkg,
                    'qty': item.qty,
                    'availableQty': item.batch.qty_strips if item.batch else 0,
                    'freeQty': item.free_qty,
                    'qtyMeasured': float(item.qty_measured) if item.qty_measured is not None else None,
                    'measuredUnit': item.measured_unit,
                    'behaviorClass': getattr(item.master_product, 'behavior_class', 'TABLET_REBUILDABLE') if item.master_product else 'TABLET_REBUILDABLE',
                    'purchaseRate': float(item.purchase_rate),"""

content = content.replace(old_block3, new_block3)

with open("apps/backend/apps/purchases/views.py", "w") as f:
    f.write(content)

print("success")
