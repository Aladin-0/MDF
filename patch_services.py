import sys

with open("apps/backend/apps/purchases/services.py", "r") as f:
    content = f.read()

# Update 1: total_strips logic
old_block1 = """            # ─── QUANTITY UNIT CONTRACT ─────────────────────────────────────────────
            # item_payload['qty']       = strips/packs purchased (e.g. 10)
            # item_payload['freeQty']   = free strips/packs (e.g. 2)
            # item_payload['actualQty'] = total loose units = (qty+freeQty) * pack_size
            #                             Saved to PurchaseItem.actual_qty for audit ONLY.
            #                             NEVER use actualQty for Batch.qty_strips.
            #
            # Batch.qty_strips must always be in STRIPS, never in loose units.
            # total_stock property handles the strips → units conversion on read.
            # ────────────────────────────────────────────────────────────────────────
            
            total_strips = int(item_payload['qty']) + int(item_payload.get('freeQty', 0))"""

new_block1 = """            # ─── QUANTITY UNIT CONTRACT ─────────────────────────────────────────────
            # item_payload['qty']       = strips/packs purchased (e.g. 10)
            # item_payload['freeQty']   = free strips/packs (e.g. 2)
            # item_payload['actualQty'] = total loose units = (qty+freeQty) * pack_size
            #                             Saved to PurchaseItem.actual_qty for audit ONLY.
            #                             NEVER use actualQty for Batch.qty_strips.
            #
            # Batch.qty_strips must always be in STRIPS, never in loose units.
            # total_stock property handles the strips → units conversion on read.
            # ────────────────────────────────────────────────────────────────────────
            
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

content = content.replace(old_block1, new_block1)

# Update 2: Batch cache update
old_block2_1 = """                batch.qty_strips += total_strips
                batch.mrp = Decimal(str(item_payload['mrp']))
                batch.purchase_rate = base_rate
                if pack_size and pack_size != batch.pack_size:
                    batch.pack_size = pack_size
                batch.save(update_fields=['qty_strips', 'mrp', 'purchase_rate', 'pack_size', 'landing_rate'])"""
new_block2_1 = """                if is_measured:
                    batch.qty_measured = (batch.qty_measured or Decimal('0')) + qty_measured_val
                    batch.measured_unit = measured_unit_val
                else:
                    batch.qty_strips += total_strips
                batch.mrp = Decimal(str(item_payload['mrp']))
                batch.purchase_rate = base_rate
                if pack_size and pack_size != batch.pack_size:
                    batch.pack_size = pack_size
                batch.save(update_fields=['qty_strips', 'qty_measured', 'measured_unit', 'mrp', 'purchase_rate', 'pack_size', 'landing_rate'])"""

content = content.replace(old_block2_1, new_block2_1)

old_block2_2 = """                    batch.qty_strips += total_strips
                    batch.mrp = Decimal(str(item_payload['mrp']))
                    batch.purchase_rate = base_rate
                    if pack_size and pack_size != batch.pack_size:
                        batch.pack_size = pack_size
                    batch.save(update_fields=['qty_strips', 'mrp', 'purchase_rate', 'pack_size', 'landing_rate'])"""

new_block2_2 = """                    if is_measured:
                        batch.qty_measured = (batch.qty_measured or Decimal('0')) + qty_measured_val
                        batch.measured_unit = measured_unit_val
                    else:
                        batch.qty_strips += total_strips
                    batch.mrp = Decimal(str(item_payload['mrp']))
                    batch.purchase_rate = base_rate
                    if pack_size and pack_size != batch.pack_size:
                        batch.pack_size = pack_size
                    batch.save(update_fields=['qty_strips', 'qty_measured', 'measured_unit', 'mrp', 'purchase_rate', 'pack_size', 'landing_rate'])"""

content = content.replace(old_block2_2, new_block2_2)


# Update 3: Create Batch
old_block3 = """                        qty_strips=total_strips,
                        qty_loose=0,
                        rack_location='',
                    )
                    logger.info(f"Created new batch {batch_no} with qty_strips={total_strips} strips")"""

new_block3 = """                        qty_strips=total_strips,
                        qty_loose=0,
                        qty_measured=qty_measured_val if is_measured else None,
                        measured_unit=measured_unit_val if is_measured else None,
                        rack_location='',
                    )
                    logger.info(f"Created new batch {batch_no} with qty_strips={total_strips} strips")"""

content = content.replace(old_block3, new_block3)

# Update 4: Create PurchaseItem
old_block4 = """                qty=int(item_payload['qty']),
                actual_qty=int(item_payload['actualQty']),
                free_qty=int(item_payload.get('freeQty', 0)),
                purchase_rate=Decimal(str(item_payload['purchaseRate'])),"""

new_block4 = """                qty=int(item_payload['qty']),
                actual_qty=int(item_payload['actualQty']),
                free_qty=int(item_payload.get('freeQty', 0)),
                qty_measured=qty_measured_val if is_measured else None,
                measured_unit=measured_unit_val if is_measured else None,
                purchase_rate=Decimal(str(item_payload['purchaseRate'])),"""

content = content.replace(old_block4, new_block4)

# Update 5: Stock Ledger Call
old_block5 = """                party_name     = purchase_invoice.distributor.name,
                qty_in         = pi.qty + pi.free_qty,
                qty_out        = 0,
                rate           = pi.purchase_rate,"""

new_block5 = """                party_name     = purchase_invoice.distributor.name,
                qty_in         = pi.qty_measured if (pi.qty_measured is not None) else (pi.qty + pi.free_qty),
                qty_out        = 0,
                rate           = pi.purchase_rate,"""

content = content.replace(old_block5, new_block5)


with open("apps/backend/apps/purchases/services.py", "w") as f:
    f.write(content)

print("success")
