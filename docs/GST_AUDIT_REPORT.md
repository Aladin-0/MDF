# GST and Tax Architecture Audit Report - MediFlow

## 1. Executive Summary
This report provides a comprehensive analysis of the existing GST, tax, accounting, and reporting architecture in the MediFlow Django + Next.js monorepo. The goal is to evaluate the system's readiness for generating GST reports (such as Purchase Register, Sales Register, GSTR-1, GSTR-2, GSTR-3B, and HSN-wise summaries) without direct portal integration.

**Key Finding:** MediFlow currently has a solid foundational double-entry accounting engine (`JournalEntry`, `JournalLine`) and granular rate-wise GST ledgers. Intra-state vs. inter-state logic is already active in the backend for both sales and purchases. However, the system is **Partially Ready** for detailed GST reporting. It lacks certain compliance-specific snapshots on transactional data (like HSN codes on sales items and B2B/B2C flags on invoices), and the frontend UI for GSTR-specific reports is not yet built.

## 2. Current GST/Tax Architecture
- **Tax Data Source of Truth:** Transactional models (`SaleInvoice`, `SaleItem`, `PurchaseInvoice`, `PurchaseItem`) store the computed tax amounts. The accounting system (`accounts.JournalEntry`) mirrors these financial impacts into rate-specific ledgers (e.g., `CGST Payable 9%`, `SGST Input 6%`).
- **State Logic:** The `_is_interstate()` helper in `apps/accounts/journal_service.py` dictates whether IGST or CGST+SGST applies by comparing the Outlet's state with the Customer's/Distributor's state.
- **Ledger Posting:** GST is correctly treated as a Balance Sheet item. Sales tax goes to `GST Payable` ledgers (Credit), and purchase tax goes to `GST Input` ledgers (Debit).
- **Rounding:** Floating-point discrepancies and penny round-offs are safely absorbed into a `Round Off` ledger to ensure strict double-entry balance.

## 3. Files Inspected
**Backend Models:**
- `apps/accounts/models.py` (Ledger, Customer, JournalEntry, DebitNote, CreditNote)
- `apps/billing/models.py` (SaleInvoice, SaleItem, SalesReturn, BillRevision)
- `apps/purchases/models.py` (PurchaseInvoice, PurchaseItem, Distributor)
- `apps/inventory/models.py` (MasterProduct, Batch)

**Backend Services & Views:**
- `apps/accounts/journal_service.py`
- `apps/reports/services.py`
- `apps/reports/views.py`

**Frontend:**
- `apps/frontend/app/dashboard/reports/page.tsx`

## 4. Data Model Audit

### Sales & Customers
- **`accounts.Customer`**: Contains `gstin`, `state`. Supports B2B identification.
- **`billing.SaleInvoice`**: Stores `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, `cgst` (rate), `sgst` (rate), `igst` (rate).
- **`billing.SaleItem`**: Stores `discount_pct`, `gst_rate`, `taxable_amount`, `gst_amount`, `total_amount`. Missing: explicit snapshot of HSN Code.
- **`billing.SalesReturn` / `SalesReturnItem`**: Exists, but `SalesReturnItem` only tracks `qty_returned`, `return_rate`, and `total_amount`. It lacks explicit tax breakdown per returned item.

### Purchases & Suppliers
- **`purchases.Distributor`**: Contains `gstin`, `state`.
- **`purchases.PurchaseInvoice`**: Stores `taxable_amount`, `gst_amount` (total), `cess_amount`. (Does not split CGST/SGST at the header level; relies on items/accounting).
- **`purchases.PurchaseItem`**: Highly detailed. Contains `hsn_code` explicitly, `gst_rate`, `cess`, `taxable_amount`, `gst_amount`, `cess_amount`.

### Inventory
- **`inventory.MasterProduct`**: Stores `hsn_code` and `gst_rate`.

### Accounts
- **`accounts.Ledger`**: Stores `gstin`, `state`, `gst_heading` (local/central/exempt), `ledger_type` (registered/unregistered/composition/consumer).

## 5. Sales Tax Flow Audit
- **Calculation:** Handled on the fly at the line level, generating `taxable_amount` and `gst_amount` per `SaleItem`.
- **Intra/Inter-state:** `journal_service.py` handles IGST vs CGST/SGST based on Customer state.
- **Ledgers:** Pushed correctly to rate-specific buckets (e.g., if a bill has 12% and 18% items, it pushes to `CGST Payable 6%`, `SGST Payable 6%`, `CGST Payable 9%`, `SGST Payable 9%`).
- **Gaps:** The `SaleItem` model relies on `inventory.MasterProduct` via `Batch` to lookup the `hsn_code`. If a product changes HSN, historical reports might break.

## 6. Purchase Tax Flow Audit
- **Calculation:** `PurchaseItem` explicitly captures `gst_rate`, `cess`, `taxable_amount`, `gst_amount`, and crucially, `hsn_code`.
- **Intra/Inter-state:** Managed seamlessly via supplier state in `journal_service.py`.
- **Ledgers:** Posts to `GST Input (CGST/SGST/IGST)` ledgers correctly.
- **Gaps:** `PurchaseInvoice` header only holds a single `gst_amount`, making it harder to query header-level CGST/SGST/IGST splits without aggregating items or inspecting Journal lines.

## 7. Accounting & Ledger Audit
- **Separation:** Input Tax (Purchases) and Payable Tax (Sales) are rigorously separated into distinct ledgers.
- **Rate-wise Ledgers:** Supported and actively used (e.g., `CGST Input 6%`, `IGST Payable 18%`).
- **P&L vs Balance Sheet:** GST ledgers are categorized under Duties & Taxes (Liability/Asset), keeping them out of the P&L, which is correct.
- **Trial Balance:** Can easily surface the net GST payable vs. Input Tax Credit (ITC) by comparing these ledgers.

## 8. Existing Report Capability
Currently, the system provides basic internal reports via `apps/frontend/app/dashboard/reports/page.tsx`, which includes a `GSTReportTab` and a `SalesReportTab`. However, these are generic internal summaries. There is no dedicated API structure yielding precise GSTR-1, GSTR-2, or GSTR-3B formats. Export utilities (CSV/XLSX) exist in `reports.services` for batches, which can be reused.

## 9. GST Report Readiness Matrix

| Report | Status | Notes |
|--------|--------|-------|
| **Sales Register** | PARTIALLY READY | Data exists, but lacks explicit Invoice Category (B2B/B2C Large/Small) field. |
| **Sales Bills** | READY | Core invoice tables contain all necessary financial data. |
| **Purchase Register**| PARTIALLY READY | Data exists. Reverse charge flag is missing. |
| **Purchase Bills** | READY | All item-level and header-level data is intact. |
| **Day-wise Summary** | READY | Journal/Invoice tables can easily group by date. |
| **GSTR-1** | NOT READY | Missing POS (Place of Supply) override, B2C/B2B categorization logic, and proper Sales Return tax breakdowns. |
| **GSTR-2/2A/2B** | PARTIALLY READY | Purchase items have HSN codes and tax. Missing reverse charge and explicit GSTR filing period mapping. |
| **GSTR-3B** | NOT READY | Ledger totals exist, but the specific layout mapping (Outward taxable, ITC eligible, etc.) is not built. |
| **HSN-wise GST** | PARTIALLY READY | Ready for Purchases (snapshotted). Not ready for Sales (requires joining to MasterProduct). |
| **TCS/TDS** | NOT READY | No fields or ledgers identified for TDS/TCS tracking. |

## 10. Data Gaps / Missing Fields
The following fields are strictly missing from the current schema for robust GST filing:
1. **Place of Supply (POS):** Not explicitly stored on invoices (relies on customer/distributor state).
2. **Invoice Category:** No explicit flag for B2B, B2C Large, B2C Small, Export, Nil-rated, or Exempt.
3. **Sales HSN Snapshot:** `SaleItem` needs an `hsn_code` string field to freeze the HSN at the time of sale.
4. **Sales Return Tax Breakdown:** `SalesReturnItem` needs explicit `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`, and `gst_rate`.
5. **Reverse Charge Flag (RCM):** Missing on `PurchaseInvoice`.
6. **Filing Period Alignment:** No concept of "GST Month/Quarter" lock to prevent backdated edits after filing.

## 11. Reuse Opportunities
- **Accounting Engine:** The double-entry system (`journal_service.py`) is highly robust. Ledger balances can be trusted for GSTR-3B aggregate totals.
- **Export System:** The CSV and OpenPyXL (XLSX) generators in `BatchWiseReportService` provide a blueprint for generating offline GST Utility excels.
- **UI Architecture:** The tabs in `reports/page.tsx` provide a great injection point for new GST-specific components.

## 12. Risks / Accuracy Concerns
- **Sales Return Taxation:** Because `SalesReturnItem` lacks granular tax fields, reversing the exact CGST/SGST/IGST of the original invoice is currently mathematically ambiguous if discounts or round-offs were applied.
- **Historical HSN Changes:** Because `SaleItem` relies on `MasterProduct` for HSN, updating a product's HSN code today will retroactively alter historical HSN sales reports.
- **Header vs Item Drift:** Floating-point rounding differences between sum(items) and header totals are handled gracefully in accounting via `Round Off`, but strict GST portal validations might reject invoices where line-item taxes don't perfectly equal the header tax to the penny.

## 13. Recommended Next Build Order
If the business decides to proceed with building internal GST reports, execution should follow this sequence:

1. **Schema Migration (Backend):**
   - Add `hsn_code` to `SaleItem`.
   - Add `place_of_supply`, `invoice_type` (B2B/B2C), and `is_reverse_charge` to Invoice models.
   - Expand `SalesReturnItem` to include detailed tax fields.
2. **Data Patching:** Run a script to backfill `hsn_code` onto existing `SaleItem`s from `MasterProduct`, and derive B2B/B2C flags based on Customer GSTIN presence.
3. **Core Registers (Backend APIs):** Build dedicated viewsets for `SalesRegister` and `PurchaseRegister` that format data exactly as required by accountants.
4. **GSTR Summaries:** Build aggregation logic for GSTR-1, GSTR-2, GSTR-3B, and HSN-wise endpoints.
5. **Frontend UI:** Add new components under the existing `GSTReportTab` to visualize these tables and trigger Excel exports formatted for the GST Offline Tool.
