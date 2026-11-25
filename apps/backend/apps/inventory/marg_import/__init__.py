"""
Loading an outlet's stock from the files Marg exports (Phase 1 of the Marg reload: products and stock).

    master.xml      the item list: name, company, HSN, GST and Marg's own "units in one pack" (CONVERSION)
    stock_NN.xls    the stock report of one day: one row per batch on the shelf

`files`  reads the two files            (no database)
`rules`  every decision, as pure functions (no database): names, pack, quantity, prices, expiry
`plan`   reads the catalogue and works out what would change (writes nothing)
`apply`  writes the plan: products, then the outlet's stock
`report` the Excel lists the shop must settle, and reading their answers back

Run it with `manage.py marg_import_stock` (show-only unless `--apply`).

The rules that matter, each in one place in `rules.py`:

* One product per item. Marg's XML drops `*`, `/` and `'` from names, so a name is matched on its letters and digits only
  (`name_key`); the stock sheet's spelling is the real one.
* A product another outlet uses is never changed. Only what Marg actually says is written (HSN, GST, pack); a blank in
  Marg never replaces a value the catalogue already has.
* Pack size: Marg's CONVERSION when it has one, else what the catalogue already has. Marg writes a part quantity as
  `packs.loose` ("3.14" of a pack of 20 is 3 packs + 14) and drops a trailing zero, so "0.5" of 100 can be 5 or 50:
  such a row is never guessed, it goes to the shop.
* Landing cost is Marg's "Cost Price". The purchase rate is Marg's "Purchase Price" unless that is above the cost
  (a list price), then the cost without GST. MRP is never invented.
* Expiry: Marg keeps the month, so the last day of that month. No expiry is 2099-12-31, the date the app already shows as
  "no expiry".
* Stock is replaced, not patched: the outlet's stock ledger is rewritten as one OPENING row per batch (docs/STOCK_LEDGER.md),
  old batches a document still points at are emptied and switched off, the rest are deleted.
"""
