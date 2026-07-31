# MediFlow GST, Tax, and Accounting Architecture Audit

## 1. Executive Summary
MediFlow possesses a robust foundational architecture for GST, accounting, and reporting, heavily inspired by standard ERP (Marg) parity. We are **not starting from zero**. 
The system already supports:
* Line-item level tax calculation (GST and Cess) on purchases.
* Tax splitting (CGST/SGST vs. IGST) based on intra-state vs. inter-state logic.
* A strict double-entry ledger system that automatically generates `JournalEntry` records, routing taxes to rate-specific ledgers (e.g., "IGST Payable 18%").
* Basic APIs for GSTR-1, GSTR-2, and GSTR-3B generation.

However, the architecture has critical schema gaps that prevent it from being a fully compliant, immutable GST engine. Specifically, it lacks historical immutability for product HSN codes on sales, lacks explicit tax breakdown on sales returns, and dynamically recomputes tax splits during report generation rather than relying on an immutable snapshot.

## 2. Codebase Mapping
The relevant tax and accounting modules are structured as follows:

* **Core & Tenancy (`apps/core/models.py`)**
  * `Organization`, `Outlet`: Manages multitenancy. `Outlet` stores `gstin`, `state`, and an auto-derived `state_code` for Place of Supply rules.
* **Inventory (`apps/inventory/models.py`)**
  * `MasterProduct`: Stores `hsn_code` and `gst_rate`.
  * `Batch`: Tracks stock, but does not duplicate GST data.
* **Billing (`apps/billing/models.py`)**
  * `SaleInvoice`: Header-level tax snapshot (`taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`).
  * `SaleItem`: Line-item tax snapshot (`taxable_amount`, `gst_amount`, `gst_rate`), but **missing HSN code**.
  * `SalesReturn` / `SalesReturnItem`: Tracks returned quantities but **missing explicit tax fields** (`gst_amount`, `taxable_amount`), relying only on `total_amount`.
* **Purchases (`apps/purchases/models.py`)**
  * `PurchaseInvoice`: Header-level tax snapshot (`gst_amount`, `cess_amount`).
  * `PurchaseItem`: Excellent line-item snapshot containing `hsn_code`, `gst_rate`, `cess`, `taxable_amount`, `gst_amount`, and `cess_amount`.
* **Accounting (`apps/accounts/models.py`, `journal_service.py`)**
  * `Ledger`, `JournalEntry`, `JournalLine`: Immutable double-entry system.
  * `journal_service.py`: Contains complex logic for splitting GST into rate-wise buckets and posting to specific Ledgers (e.g., Output Tax / Payable vs. Input Tax / Receivable).
* **Reporting (`apps/reports/views.py`)**
  * Contains `GSTR1ReportView`, `GSTR2ReportView`, `GSTR3BReportView` which dynamically aggregate items for HSN summaries.

## 3. Data Model Audit
| Model | Module | GST/Tax Fields | Snapshot Quality |
| :--- | :--- | :--- | :--- |
| **MasterProduct** | `inventory` | `hsn_code`, `gst_rate` | N/A (Master Data) |
| **SaleInvoice** | `billing` | `cgst_amount`, `sgst_amount`, `igst_amount`, `taxable_amount` | Strong. Locks header amounts. |
| **SaleItem** | `billing` | `taxable_amount`, `gst_amount`, `gst_rate` | **Weak.** Missing `hsn_code`. Relies on `batch.product.hsn_code`, violating immutability if product master changes. |
| **PurchaseInvoice** | `purchases` | `gst_amount`, `cess_amount`, `taxable_amount` | Strong. |
| **PurchaseItem** | `purchases` | `hsn_code`, `gst_rate`, `cess`, `taxable_amount`, `gst_amount` | **Excellent.** Full snapshot of all variables. |
| **SalesReturnItem** | `billing` | `qty_returned`, `return_rate`, `total_amount` | **Critical Weakness.** No tax isolation. Refunds must be reverse-calculated. |
| **DebitNoteItem** | `accounts` | `qty`, `rate`, `gst_rate`, `total` | Moderate. |
| **Customer/Distributor**| `accounts`/`purchases`| `gstin`, `state` | Strong. Allows B2B vs B2C routing. |
| **Outlet** | `core` | `gstin`, `state`, `state_code` (auto-derived) | Strong. Enforces entity isolation. |

## 4. Transaction Tax Flow
* **Sales Flow**: Tax is calculated on the client/API based on `MasterProduct` rate. Saved to `SaleInvoice` & `SaleItem`. Then `journal_service.py` is invoked. It checks if `customer.state == outlet.state` (or uses invoice headers) to decide IGST vs CGST/SGST. It groups line items into rate buckets (e.g., 5%, 12%) and posts to `Ledger`s.
* **Reports Flow**: Currently, `GSTR1ReportView` queries `SaleItem`, retrieves HSN from `item.batch.product.hsn_code` dynamically, and recalculates CGST/SGST/IGST using a `split_gst` helper based on GSTINs. **This means reports do not strictly trust the accounting snapshot, risking mismatch between Ledger balance and GST returns.**

## 5. Accounting and Ledger Audit
* **Ledgers**: MediFlow creates individual ledgers for different tax types and rates (e.g., `CGST Payable 9%`, `IGST Receivable 18%`).
* **Separation**: Sales-side taxes are posted to "Payable" (Output Tax - Liability) and purchase-side to "Receivable" (Input Tax - Asset).
* **Adequacy**: This structure is excellent for internal Balance Sheet generation and general accounting. However, tying GST reports directly to general ledgers is risky. A dedicated tax snapshot table is preferred for compliance filing.

## 6. GST Report Readiness Matrix
| Report | Readiness | Missing Data / Blockers |
| :--- | :--- | :--- |
| **GSTR-1** | Partially Ready | `SaleItem` lacks immutable `hsn_code`. Returns lack direct tax line items. |
| **GSTR-3B** | Partially Ready | Relies on dynamic computation. Need immutable tax records for exact month-end freezing. |
| **HSN Summary** | Partially Ready | `SaleItem` relies on live Product master. Past sales could shift buckets if Product is edited. |
| **Sales/Purchase Reg.** | Ready | Sufficient data exists at the header level. |
| **GSTR-2B Recon** | Not Ready | Lacks GSTN portal integration / JSON parser / GSP abstraction. |

## 7. Multi-Outlet / GSTIN Isolation Audit
* **Status**: **Strong.** 
* Every transaction model (`SaleInvoice`, `PurchaseInvoice`, `Ledger`, `Voucher`) explicitly contains an `outlet` foreign key.
* The system utilizes a custom `OutletFilteredManager` to ensure queries cannot accidentally cross-contaminate.
* Each outlet stores its own `gstin`. Future GSP integration can safely operate on an outlet-by-outlet basis.

## 8. Gap Analysis
1. **Critical:** Missing `hsn_code` in `SaleItem`. Past invoices will change HSN in reports if the `MasterProduct` is updated.
2. **Critical:** `SalesReturnItem` lacks `gst_amount`, `taxable_amount`, and `gst_rate`. Reversing taxes safely requires reverse-calculating from the original sale, which is error-prone.
3. **Important:** GSTR views (e.g., `GSTR1ReportView`) dynamically re-split tax (`split_gst` function) instead of reading the finalized invoice/ledger snapshot.
4. **Important:** No centralized, immutable `gst_transaction_snapshot` table. Tax data must be joined across 5+ different tables (Sales, Purchases, Returns, Debit Notes, Credit Notes) to build a unified report.

## 9. Recommended Target Architecture
We must decouple the *internal accounting engine* from the *compliance reporting engine*.

* **`gst_transaction_snapshot` (New Model)**: A unified, immutable ledger specifically for tax reporting. Every time a Sale, Purchase, or Return is finalized, a row is written here containing:
  * `outlet`, `transaction_type`, `transaction_id`, `date`
  * `b2b_or_b2c`, `party_gstin`, `place_of_supply`
  * `hsn_code`, `taxable_value`, `gst_rate`
  * `cgst_amount`, `sgst_amount`, `igst_amount`, `cess_amount`
* **`gst_report_builder` (Service)**: Reads *only* from the `gst_transaction_snapshot` to build GSTR-1/3B.
* **`gst_portal_provider` (Interface)**: An abstraction layer for future GSP integration (e.g., ClearTax) for GSTR-2B reconciliation.

## 10. Phase-wise Safe Implementation Plan
**Phase 1: Schema Integrity Fixes (Immediate)**
* Add `hsn_code` to `SaleItem`.
* Add `taxable_amount`, `gst_amount`, `gst_rate` to `SalesReturnItem`.
* Update save logic to snapshot these fields permanently on creation.

**Phase 2: GST Snapshot Engine**
* Create the `gst_transaction_snapshot` model.
* Write a backfill script to populate this table from historical `SaleItem`, `PurchaseItem`, and Notes.
* Add hooks to automatically create snapshots on new transaction creation.

**Phase 3: Local Report Engine Rewrite**
* Refactor `GSTR1ReportView`, `GSTR2ReportView`, and `GSTR3BReportView` to query the new `gst_transaction_snapshot` table instead of joining dynamic data.
* Ensure reports run in milliseconds via indexed snapshot queries.

**Phase 4: External GSP Integration (Future)**
* Implement GSP hooks for downloading GSTR-2B JSON.
* Build a reconciliation UI comparing GSTR-2B against local `gst_transaction_snapshot` purchases.

## 11. Evidence Appendix
* **`SaleItem` Missing HSN**: `apps/billing/models.py` line ~116. Shows `gst_rate`, `gst_amount`, but no `hsn_code`.
* **Dynamic GSTR1 Calculation**: `apps/reports/views.py` line ~240 inside `GSTR1ReportView`. Uses `item.batch.product.hsn_code` and re-calls `split_gst(gst_amt, outlet_gstin, customer_gstin)`.
* **Rate-wise Ledgers**: `apps/accounts/journal_service.py` line ~200. `_get_ledger_safe(outlet, f'IGST Payable {snapped_rate}%')`.
* **`SalesReturnItem` lacks tax isolation**: `apps/billing/models.py` line ~595. Only fields are `qty_returned`, `return_rate`, `total_amount`.
