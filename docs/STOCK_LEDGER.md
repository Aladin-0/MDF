# Stock Ledger (`/dashboard/stockledger`) and ledger health

Read this before changing the ledger screen, `post_stock_ledger_entry`, or anything that adds `StockLedger` rows.
Research and reasoning behind the redesign: `docs/BATCH_TRACKING_REPORT.md`.

## The screen: product first, then batch, then history

Like Tally / Zoho / SAP: search a **product or a batch number**, see its batches as cards (soonest expiry first, sold-out last),
pick one for its card and history. Filters live in the URL (`product`, `batch`, `from`, `to`, `type`, `q`, `page`, `size`;
`hooks/useLedgerFilters`, pure rules in `lib/stockLedger.ts`). The old flat list of every batch (7,405 rows) is gone.

* **One line per movement, in words:** "Sold" / "Received" / "Written off: Expired" / "Returned to supplier" / "Opening balance
  recorded", with the customer or supplier and the invoice or reason under it. Worked out on the server (`ledger_view.describe`);
  the old Type + Voucher + Party columns all said the same thing and the write-off reason was squeezed into "Party".
* **One signed quantity and one balance**, in the **batch's own** pack words (`packsText`: "5 strips + 3 tablets", "2 bottles").
  `formatDecimalQty` (shared) hard-codes "strip"/"tablet", which is why a 300 GM product showed "1 tablet": do not use it here.
  Each row carries the batch's pack (the product's size is only a fallback).
* **Money is off by default** ("Show rupee values (at cost)"), and the server sends **no** rate or value to a user without
  `view_purchase_rates` (JSON and Excel). Before, every role got cost prices from this endpoint. The summary is counts (Received,
  Sold, Written off, Movements), not rupees mixed with fractional packs. Repair rows are bookkeeping, not movement.
* **Negative balance** is flagged with a reason ("history is incomplete"), never shown as if billing were wrong.

API (`inventory/views.py StockLedgerView`, `ledger_views.py`, rules in `ledger_view.py`):
`GET /inventory/stockledger/` (rows, `summary`, and a `batch` card when `batchId` is given: identity, stock, expiry, first supplier,
ledger state) · `/stockledger/products/?q=` or `?productId=` (the picker; outlet-scoped; batches inside) · `/stockledger/health/`.

## Opening the invoice behind a row, and the Excel

* Each ledger row carries `source` (`ledger_view.resolve_sources`, three queries for a page): `{kind: sale|purchase|sale_return|debit_note, id}`
  from the row's `content_type` + `object_id` (the sale/purchase LINE), mapped to the INVOICE id. Opening stock, adjustments and repairs have none.
  The invoice reference under "What happened" becomes a link that opens the **same preview the Sales / Purchases pages use**
  (`InvoicePreviewModal`, `PurchaseDetailModal`, via `InvoiceViewer`), also from the batch card's supplier line and the "Who received this
  batch" list. Only sales and purchases preview; a link is offered only to people with `create_bills` (sale) / `view_purchases` (purchase).
  The sale preview's **PDF** button had an empty handler (it did nothing); it now opens the print window, where "Save as PDF" downloads it.
* **The Excel** (`ledger_export.py`, styling shared in `xlsx_helpers.py` with the Expiry and trace files): title + filters + generated line, a dark
  header, frozen header and first columns, a filter, widths that do not cut text, REAL dates and numbers (sortable, summable), the quantity in
  words AND as signed packs, oldest first (the balance reads downward), negative balances red with a note, a Summary sheet, landscape print with
  the header repeated, formula-safe text, money only with `view_purchase_rates`, capped at 50,000 rows with a note. Quantity words use
  `ledger_export.packs_words`, the same rule as `packsText` on screen. The old file was plain `ws.append` rows: dates as text, default widths,
  raw fractions of packs, no filter.

## Who supplied it, and who got it (recall)

* **Supplier of a batch** = the distributor of its first POSTED purchase (draft invoices are not evidence); else the supplier ASSIGNED to
  the batch (`Batch.supplier`, migration 0030); else none. In the dev data only 1.2% of stocked batches had a purchase, so the
  distributor filter and the return flow were nearly empty until old stock gets a supplier.
* **Assign distributor** (Expiry Manager action, `POST /inventory/batches/assign-supplier/`, manager+): changes ONLY `supplier`, only on
  batches with no posted purchase (an invoice is evidence, a click is not: those are skipped and reported). One audit entry each.
  An assigned batch cannot be returned by invoice (a debit note is against one invoice), so it is listed as "cannot be returned from here".
* **Who received this batch** (`GET /batches/<id>/trace/`, `?export=xlsx`; panel on the batch card): the purchases that brought it in,
  every sale out of it (invoice, customer and phone, the person it was for (`patient`), quantity, returned), totals. Cancelled invoices
  and return invoices are not sales. Cost only with `view_purchase_rates`. For a supplier recall, an inspector or a complaint.

## Ledger health: why it exists

Found on the dev database: 69% of stocked batches had **no ledger rows** (an import wrote batches, not the opening balance), so the
first sale or write-off drove their balance negative; 552 rows were negative; 465 active batches' ledger disagreed with the stock.

`apps/inventory/ledger_health.py` classifies every batch (whole **units**, never a pack tolerance) and repairs:

| State | Meaning | Repair |
|---|---|---|
| `A` no ledger | holds stock, no rows | add an opening balance (safe) |
| `B` no opening | rows, no opening, positive gap | add a backdated opening, recompute running (safe) |
| `R` running off | totals agree, stored balance column wrong | recompute (safe) |
| `B2` / `C` | the ledger holds more / differs although there is an opening | **owner's decision** (`--corrections`): a movement dated today |

Rules that were learned the hard way:
* **The batch row is the truth about stock; stock is never changed by a repair.** `services.rebuild_stock_ledger` is NOT used for
  repairs: it overwrites the batch's stock from the ledger (and starts from `Batch.opening_qty`, which already equals the OPENING row).
  `ledger_health.recompute_running` touches only the derived `running_*` columns.
* **The P&L adds up `OPENING` ledger rows as "Opening Stock"** (`accounts/voucher_views.py`). So a repair is booked as an
  `ADJUSTMENT_IN` with voucher type "Ledger repair": **no profit figure moves**. Booking it as true OPENING stock
  (`--book-as-opening`) would add the amount `scan()` reports; that is an accounting decision, never the default.
* A repair never creates a GST write-off (`post_stock_ledger_entry(..., gst_record=False)`); it never touches `Batch`.
* Idempotent (a repaired batch classifies OK). Dry run by default.
* **New write-offs open an empty ledger first** (`open_if_missing`, used by the Expiry Manager and the single Adjust): otherwise
  the new row starts from zero. It is deliberately NOT done inside `post_stock_ledger_entry` (some callers save the batch before
  posting, some after, so the right opening cannot be guessed there). Imports must post an OPENING row (`import_marg_data` does; the
  Sept 2026 re-import did not).

```
docker exec mediflow_backend python manage.py repair_stock_ledger                       # dry run: counts, P&L impact
docker exec mediflow_backend python manage.py repair_stock_ledger --apply               # the safe repairs (no profit figure moves)
docker exec mediflow_backend python manage.py repair_stock_ledger --apply --corrections # + the owner's-decision cases
```
`reconcile_inventory` is now a read-only report on the same classification (it used to compare units with packs).

Admins can also repair the SAFE states from the page (`POST /stockledger/health/`, confirmed with their own password; a wrong one is
a 400, never a 401, which would sign them out; 5 wrong in 15 minutes lock it). Managers see the banner; nobody below manager does.

## Tests
Backend `apps/inventory/tests/test_ledger_health.py`, `test_stock_ledger_api.py`, `test_batch_trace.py`, `test_adjustment_units.py`; frontend
`components/stockledger/__tests__/*`, `lib/__tests__/stockLedger.test.ts`, `components/expiry/__tests__/AssignSupplierDialog.test.tsx`.
