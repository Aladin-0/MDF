# Phase 2: Backfill Plan for GST Snapshots

## Objective
Generate `gst_transaction_snapshot` rows for all historical `SaleItem`, `SalesReturnItem`, and `PurchaseItem` records that do not currently have one.

## Source Models Included
1. **SaleItem**: Uses `SaleItem.hsn_code` and splits taxes based on `SaleInvoice` logic.
2. **SalesReturnItem**: Uses negative quantities/amounts and splits taxes based on original `SaleInvoice`.
3. **PurchaseItem**: Uses line-level GST amounts and splits based on `Distributor.state` vs `Outlet.state`.

## Sign & Polarity Rules
- **Sales & Purchases**: Inserted as positive `taxable_value` and positive tax amounts.
- **Sales Returns**: Inserted as **negative** `taxable_value` and negative tax amounts, reflecting a reduction in output tax liability.

## Duplicate Prevention Strategy
The `backfill_gst_transaction_snapshot` command will be strictly idempotent.
- **Verification mechanism**: Before generating a snapshot for a source item, the script checks if a snapshot with `source_model` and `source_item_id` matching the target item already exists.
- If it exists, the item is skipped. 
- A unique constraint (or indexing strategy) will enforce `source_model` + `source_item_id` uniqueness at the DB level where applicable.

## Ambiguity Reporting Strategy
Any record that lacks necessary data for GST generation (e.g., missing `hsn_code` where Phase 1 backfill failed, or malformed/missing parent objects) will NOT halt the script.
- The command will keep a list of `skipped_records`.
- At the end of execution, a summary will be printed showing the count of successful creations vs skips.
- If `--dry-run` is active, it will print exactly which records would be skipped and why, allowing manual review.

## Dry-Run Behavior
The management command must implement a `--dry-run` flag.
When active:
- `transaction.atomic()` is used and forcibly rolled back at the end.
- Alternately, no `objects.create()` calls are executed, only counting logic is processed.
- A summary output details exactly how many rows *would* be created for each type.
