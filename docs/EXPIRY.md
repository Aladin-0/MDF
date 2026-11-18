# Expiry Manager (`/dashboard/inventory/expiry`)

Read this before changing near-expiry search, the expiry export, bulk stock write-off or "return to distributor".
(The older Expiry report tab and the Inventory "Expiring Soon" tab still exist; the Manager is the place to act.)

## What it does

Find batches by expiry window (Expired / This month / Next month / 30-60-90-180 days / picked months / custom dates), narrow
by one or several distributors (or "No purchase record") and a search, then act on the ticked rows:
**Export to Excel**, **Return to distributor** (debit note), **Remove from stock** (write-off). Nothing is a new table: it
reads `Batch` and writes through the existing stock ledger / `StockAdjustment`.

## Rules (one place each)

| Question | Rule | Where |
|---|---|---|
| Expired? | `expiry_date < today`. Expiring TODAY is still sellable. (The batch-wise report uses `<= today`: do not copy it.) | `apps/inventory/expiry.py` |
| Which batches are listed? | active, still holding stock (strips or loose), expiry inside the window, this outlet only | `expiry_queryset` |
| No date given | next 90 days plus everything already expired | `parse_filters` |
| "Include already expired" default | ON for "next N days", OFF for a month / date range (those mean exactly what was asked) | `defaultIncludeExpired` in `lib/expiryManager.ts` |
| A batch's distributor | distributor of its FIRST **POSTED** purchase (draft `SAVED` invoices are not suppliers); else the supplier ASSIGNED to the batch (`Batch.supplier`, "Assign distributor" action; `supplierAssigned` is true and it has no invoice, so it cannot be returned by invoice); `moreSuppliers` when others supplied the same batch. None = "No purchase record". | `annotated_batches` |
| Value | packs x landing rate (purchase rate when no landing), like the product page; MRP value too | `row_of` |
| Totals / group counts / "select all N" ids | computed on the server over EVERY match, never from the page on screen | `summarize`, `withIds` |
| Cost figures | left out of the JSON **and** the Excel unless the user has `view_purchase_rates` | `_show_rates` |

## API (`apps/inventory/expiry_views.py`, urls in `inventory/urls.py`)

* `GET /inventory/expiry/` filters `from,to,months=2027-03,2027-04,includeExpired,distributorIds=<id>,<id>,none,q,sort(expiry|distributor|product|value),page,pageSize(<=100),withIds` -> `{data,totals,groups,pagination,matchingIds?}`. Any signed-in user of the outlet.
* `GET /inventory/expiry/export/` same filters -> `.xlsx` (sheet "Near expiry" + "By distributor"). `POST` with `{batchIds}` exports exactly the ticked rows (ids of other outlets match nothing). Cells that start with `= + - @` are escaped.
* `POST /inventory/expiry/remove/?outletId=` `{type: EXPIRED|DAMAGED|DESTROYED, reason, password, items:[{batchId, qtyStrips?, qtyLoose?}]}`; no quantity = everything the batch holds. Manager and above (`adjust_stock`). Confirmed with the SIGNED-IN user's own password (or their own login PIN, as the login box accepts either; a colleague's never works). A wrong one is a plain 400 `WRONG_PASSWORD` (NOT a 401: the app signs the person out on every 401) and 5 wrong in 15 min lock it for the user (429). **All or nothing** in one transaction: batches are locked in id order, an id of another outlet is "not found", any refusal rolls everything back and names the batch (`error.batchId`). Writes a ledger `ADJUSTMENT_OUT`, a `StockAdjustment` (the chosen type and note), one audit entry per batch, then `bump_inventory_cache` once.

## Screen

* Filters live in the URL (`hooks/useExpiryFilters`, pure rules in `lib/expiryManager.ts`); changing what MATCHES clears the ticks. Dates are built from local parts (`ymd`), never `toISOString()`.
* Table from `md`, a card per batch below it; the action bar is sticky with safe-area padding. "Expired" is always said in words, not only colour.
* **Return to distributor** only groups the ticked batches by the purchase invoice that brought them in (a debit note is against ONE invoice) and opens `/dashboard/accounts/purchase-returns/new?invoiceNo&invoiceId&batchIds` with just those lines. Nothing is saved from the Manager; stock changes when the debit note is saved. Batches with no purchase record are listed as "cannot be returned from here".
* The password box is masked **text**, not `type=password`: Chrome's password manager treated the Note box as the username and filled it with a phone number.

## A units bug fixed on the way

The ledger counts PACKS (`qty_in` of a purchase, `qty_out` of an adjustment) while `PurchaseItem.actual_qty` is UNITS. `_auto_create_stock_adjustment` treated packs as units, so writing off 43 packs of a pack-size-10 batch was stored as 4 strips + 3 loose and reversed a tenth of the GST. It now converts once (`qty_out_units`) and also keeps the adjustment type and note. Rows written before the fix keep their old numbers. Test: `apps/inventory/tests/test_adjustment_units.py`. The single-batch adjust view still always records type EXPIRED (it does not pass its own type through).

## Tests

Backend `apps/inventory/tests/test_expiry_manager.py`, `test_adjustment_units.py`; frontend `lib/__tests__/expiryManager.test.ts`, `components/expiry/__tests__/*`, `app/dashboard/inventory/expiry/__tests__/*`. Run backend tests inside the container: `docker exec mediflow_backend sh -c "cd /app && python -m pytest apps/inventory/tests/test_expiry_manager.py"`.
