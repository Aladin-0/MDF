# Phase 0: Baseline Tax Flow Architecture

This document serves as the baseline record of the current (Phase 0) GST and accounting flow in MediFlow, *before* any schema immutability or snapshot features are added.

## 1. Sales Flow

**GST Calculation Location:** GST is primarily calculated on the client side (frontend) or the API request payload, based on the `MasterProduct`'s `gst_rate`. The backend verifies amounts but mostly accepts the passed values.

**Tax Data Storage:**
* `SaleInvoice` (Header): Stores total `taxable_amount`, `gst_amount`, `cgst_amount`, `sgst_amount`, and `igst_amount`.
* `SaleItem` (Line Item): Stores `taxable_amount`, `gst_amount`, and `gst_rate`.

**Interstate vs Intrastate Decision:**
* The backend (`journal_service.py`) checks if the sale is interstate by comparing the `customer.state` with the `outlet.state`. If they are different (and not blank), it treats it as interstate.
* If `igst_amount > 0` is passed on the invoice header, it forces the interstate (IGST) path.

**Journal Posting (`journal_service.py`):**
* The system groups all `SaleItem`s by their `gst_rate`.
* **Interstate (IGST):** Posts the aggregated tax to rate-specific ledgers, e.g., `IGST Payable {rate}%`.
* **Intrastate (CGST/SGST):** Posts half the aggregated tax to `CGST Payable {rate/2}%` and half to `SGST Payable {rate/2}%`.
* The customer account (Sundry Debtors) is debited for the grand total, and the Sales Account is credited for the taxable amount.

## 2. Purchase Flow

**GST Calculation Location:** Determined during the GRN (Goods Receipt Note) creation. Taxable amounts and GST are calculated per batch based on PTR/discount and `MasterProduct.gst_rate` or custom inputs.

**Tax Data Storage:**
* `PurchaseInvoice`: Stores `taxable_amount`, `gst_amount`, and `cess_amount`.
* `PurchaseItem`: Stores `hsn_code`, `gst_rate`, `cess`, `taxable_amount`, `gst_amount`, and `cess_amount`.

**Journal Posting (`journal_service.py`):**
* Similar to sales, it determines interstate vs intrastate by comparing the `distributor.state` with the `outlet.state`.
* Groups `PurchaseItem`s by `gst_rate`.
* **Interstate:** Posts to `IGST Input {rate}%`.
* **Intrastate:** Posts to `CGST Input {rate/2}%` and `SGST Input {rate/2}%`.
* The distributor account (Sundry Creditors) is credited for the grand total.

## 3. Return Flow

**Sales Returns (Credit Note):**
* Created via `CreditNoteService.create()`.
* **Journal Impact:** Currently, creating a Credit Note linked to a `SaleInvoice` calls `reverse_journal('SALE', invoice_id)`. This entirely contra-posts (reverses) the original sale's journal entry, rather than posting a partial return. This is a very blunt instrument if the return is partial.

**Purchase Returns (Debit Note):**
* Posted via `post_debit_note()`.
* **Journal Impact:** It correctly creates a partial reversal journal entry.
  * Dr. Distributor Ledger (Sundry Creditors)
  * Cr. Purchase Returns Account
  * Cr. CGST/SGST/IGST Input {rate}% (Reversing the input credit claimed).
  * Rate inference is done dynamically by checking `gst_amount / subtotal`.

## 4. Outlet & GSTIN Isolation

* **Strict FKs:** All financial models (`SaleInvoice`, `PurchaseInvoice`, `Ledger`, `JournalEntry`, `Voucher`) possess an `outlet` Foreign Key.
* **Filtered Queries:** The models implement `OutletFilteredManager` (`objects.for_outlet(outlet_id)`), ensuring strict tenancy at the ORM level.
* **GSTIN:** Each outlet maintains its own `gstin` and `state_code` in the `core_outlet` table.
* **Verdict:** Isolation is highly stable. There is no risk of GSTIN data leakage across queries unless raw SQL intentionally omits the outlet filter.

## 5. Known GST Engine Gaps (Deferred to Phase 1/2)

The following schema gaps exist but are deliberately **NOT** fixed in Phase 0. They will be addressed in Phase 1 (Schema Fixes) and Phase 2 (Snapshot Engine):

* **Missing `SaleItem.hsn_code` Immutability:** Sales line items do not store HSN directly; they rely on joining the live `MasterProduct`.
* **Missing `SalesReturnItem` Tax Isolation:** Return items do not explicitly record `taxable_amount` or `gst_amount`.
* **Dynamic Split Logic in Reports:** `GSTR1ReportView` dynamically splits GST instead of trusting the invoice snapshot.
* **Blunt Sales Return Accounting:** `reverse_journal` reverses the entire sale instead of posting a partial reversal for partial returns.
