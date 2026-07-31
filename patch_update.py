with open("apps/backend/apps/purchases/services.py", "r") as f:
    content = f.read()

old_block = """            batch_key = (batch_no, expiry_date)
            total_strips = int(item_payload['qty']) + int(item_payload.get('freeQty', 0))"""

new_block = """            batch_key = (batch_no, expiry_date)
            behavior_class = master_product.behavior_class if master_product else 'TABLET_REBUILDABLE'
            is_measured = behavior_class in ['LIQUID_MEASURED', 'CREAM_MEASURED', 'UNIT_ONLY']
            qty_measured_val = None
            measured_unit_val = None
            
            if is_measured:
                qty_measured_val = Decimal(str(item_payload.get('qtyMeasured') or '0'))
                measured_unit_val = item_payload.get('measuredUnit')
                if not measured_unit_val:
                    if behavior_class == 'LIQUID_MEASURED': measured_unit_val = 'ml'
                    elif behavior_class == 'CREAM_MEASURED': measured_unit_val = 'gm'
                    elif behavior_class == 'UNIT_ONLY': measured_unit_val = 'unit'
                total_strips = 0
            else:
                total_strips = int(item_payload['qty']) + int(item_payload.get('freeQty', 0))"""

content = content.replace(old_block, new_block)

old_block_batch = """                    batch.qty_strips += total_strips
                    batch.mrp = Decimal(str(item_payload['mrp']))
                    batch.purchase_rate = base_rate
                    if pack_size and pack_size != batch.pack_size:
                        batch.pack_size = pack_size
                    batch.save(update_fields=['qty_strips', 'mrp', 'purchase_rate', 'pack_size', 'landing_rate'])"""

new_block_batch = """                    if is_measured:
                        batch.qty_measured = (batch.qty_measured or Decimal('0')) + qty_measured_val
                        batch.measured_unit = measured_unit_val
                    else:
                        batch.qty_strips += total_strips
                    batch.mrp = Decimal(str(item_payload['mrp']))
                    batch.purchase_rate = base_rate
                    if pack_size and pack_size != batch.pack_size:
                        batch.pack_size = pack_size
                    batch.save(update_fields=['qty_strips', 'qty_measured', 'measured_unit', 'mrp', 'purchase_rate', 'pack_size', 'landing_rate'])"""

content = content.replace(old_block_batch, new_block_batch)

old_block_new_batch = """                        qty_strips=total_strips,
                        qty_loose=0,
                        rack_location='',
                    )"""

new_block_new_batch = """                        qty_strips=total_strips,
                        qty_loose=0,
                        qty_measured=qty_measured_val if is_measured else None,
                        measured_unit=measured_unit_val if is_measured else None,
                        rack_location='',
                    )"""

content = content.replace(old_block_new_batch, new_block_new_batch)


with open("apps/backend/apps/purchases/services.py", "w") as f:
    f.write(content)

