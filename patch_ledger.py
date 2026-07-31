with open("apps/backend/apps/purchases/services.py", "r") as f:
    content = f.read()

old_ledger = """                party_name     = purchase_invoice.distributor.name,
                qty_in         = pi.qty + pi.free_qty,
                qty_out        = 0,
                rate           = pi.purchase_rate,"""

new_ledger = """                party_name     = purchase_invoice.distributor.name,
                qty_in         = pi.qty_measured if (pi.qty_measured is not None) else (pi.qty + pi.free_qty),
                qty_out        = 0,
                rate           = pi.purchase_rate,"""

content = content.replace(old_ledger, new_ledger)

with open("apps/backend/apps/purchases/services.py", "w") as f:
    f.write(content)

