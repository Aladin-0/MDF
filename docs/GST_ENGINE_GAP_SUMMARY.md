# MediFlow GST Engine - Implementation Gap Summary

Based on a deep code analysis, MediFlow has a strong architectural foundation (multi-tenant isolation, line-item GST rates, robust double-entry accounting). However, there are specific schema and architectural gaps that must be resolved before building a compliant GST engine.

## 1. Schema Weaknesses (Immutability Gaps)
* **`SaleItem` lacks `hsn_code`:** Currently relies on `batch.product.hsn_code`. If a product's HSN is updated in the master, past GST reports will mutate.
* **`SalesReturnItem` lacks tax breakdown:** Stores `total_amount` but missing `taxable_amount`, `gst_amount`, and `gst_rate`. Accurately reversing output tax relies on fragile recalculations.
* **Report Dynamic Recalculation:** `GSTR1ReportView` uses a `split_gst()` helper on the fly rather than trusting the original `igst_amount`/`cgst_amount` snapshot saved on the invoice header.

## 2. Structural Missing Pieces
* **No Unified Tax Ledger:** GST data is scattered across `SaleItem`, `PurchaseItem`, `DebitNoteItem`, and `CreditNoteItem`. Generating a high-speed GSTR-3B requires complex, slow UNION queries across multiple tables.
* **No GSP Abstraction:** GSTR-2B reconciliation is planned, but there is no abstract service layer ready to handle external GSTN portal credentials or JSON parsing.

## 3. Implementation Prerequisites
Before building the actual GST reporting UI or GSP integration, the following **must** be executed:

1. **Schema Patch:** Add `hsn_code` to `SaleItem` and tax breakdown fields to `SalesReturnItem`.
2. **Unified Snapshot Table (`gst_transaction_snapshot`):** Create an append-only table that stores every taxable event (B2B/B2C, HSN, Taxable Value, CGST/SGST/IGST, Cess, Date, Outlet).
3. **Data Backfill:** Write a migration script to safely port historical data into the new snapshot table.
4. **Report Rewrite:** Point all existing `reports/views.py` GSTR APIs to read strictly from the `gst_transaction_snapshot` table.

## Conclusion
Do **not** build the GST UI or portal integrations on the current schema. Fix the `SaleItem` and `SalesReturnItem` immutability first, introduce the unified snapshot table, and then the GST engine will be mathematically safe to implement.
