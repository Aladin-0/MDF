# ITC Reconciliation Summary for CA Review

## 1. Overview
- **Period (fp):** 082026
- **Entity GSTIN:** 24BBBBB0000B1Z5
- **Data Set:** SEED test data comprising 12 regular purchase invoices, 2 RCM invoices, 1 purchase return, 1 Rule 37 adjustment, and 1 Section 17(5) loss reversal.
- **Note on GSTR-2B:** The GSTR-2B data for this test period is **mocked** via the sandbox provider simulator, as live portal access is not used in the test environment.

## 2. ITC Computation from Purchase Records

### Data Model and Logic
ITC is aggregated primarily from `GSTTransactionSnapshot` records generated upon purchase invoice approval.
- **Data Flow:** `PurchaseInvoice` → `PurchaseInvoiceItem` → `GSTTransactionSnapshot`.
- **Snapshot Fields:** `taxable_amount`, `igst`, `cgst`, `sgst`, `cess`, along with boolean flags like `is_rcm`, `is_import`, and `is_b2b`.

**Aggregation Logic:**
1. **Gross ITC Available:** Sum of all eligible inward supplies (IGST, CGST, SGST). 
   - Broken down into *Import of Goods*, *Import of Services*, *Inward supplies liable to reverse charge*, and *All other ITC* based on snapshot flags.
2. **ITC Reversals:** 
   - **Rule 37** (unpaid > 180 days) sourced from `Rule37Adjustment` records.
   - **Section 17(5)** (e.g., physical stock loss, expired goods) sourced from `StockAdjustmentAllocation` records.
3. **Net ITC Available:** Gross ITC − Reversals − Blocked/Ineligible ITC.

### Computed ITC for 082026 (Test Data)

| Component | IGST (₹) | CGST (₹) | SGST (₹) | Total (₹) |
| :--- | :--- | :--- | :--- | :--- |
| **Gross ITC (all eligible)** | 50,000.00 | 25,000.00 | 25,000.00 | 100,000.00 |
| Less: Rule 37 reversals | 0.00 | 900.00 | 900.00 | 1,800.00 |
| Less: Section 17(5) reversals | 0.00 | 450.00 | 450.00 | 900.00 |
| Less: Other reversals | 0.00 | 0.00 | 0.00 | 0.00 |
| Ineligible ITC (blocked) | 0.00 | 0.00 | 0.00 | 0.00 |
| **Net ITC available for offset** | **50,000.00** | **23,650.00** | **23,650.00** | **97,300.00** |

**Mapping to GSTR-3B Table 4:**
- **4(A) ITC Available:** Populated from Gross ITC breakdown (e.g., 4(A)(3) for RCM, 4(A)(5) for All other).
- **4(B) ITC Reversed:** Rule 37 and 17(5) mapped strictly to 4(B)(2) and 4(B)(1) respectively using official GSTR-3B `ty` keys.

## 3. GSTR-2B Reference Data

The GSTR-2B JSON is fetched via the active GST Suvidha Provider (GSP) and parsed into `GSTR2BData` models. For this period, the data is mocked to simulate common reconciliation scenarios.

| Metric | Value |
| :--- | :--- |
| Number of suppliers in 2B | 5 |
| Number of invoices in 2B | 11 |
| Total ITC as per 2B (IGST/CGST/SGST) | IGST: 50,000 \| CGST: 24,100 \| SGST: 24,100 |
| **Total ITC as per 2B (overall)** | **98,200.00** |

*Note: One test supplier is mocked as having not filed their GSTR-1, causing a deliberate missing invoice in 2B.*

## 4. Reconciliation Methodology

The `GSTR2BService` reconciliation engine cross-references purchase snapshots with GSTR-2B records.

**Match Keys:**
- **Primary:** `[Supplier GSTIN] + [Invoice Number] + [Period]`
- **Secondary (Fuzzy):** `[Supplier GSTIN] + [Stripped Invoice Number]`

**Invoice Normalization (`strip_invoice_number`):**
Non-alphanumeric characters (slashes, dashes) are stripped, the string is converted to uppercase, and leading zeros are removed.

**Configured Tolerances (`GSTR3BValidationConfig`):**
- **Value/Tax Tolerance:** ± ₹1.00
- **Date Tolerance:** ± 2 days
- **Tax Rate Tolerance:** ± 1% (effective tax rate comparison)

**Mismatch Categories:**
- `MISSING_IN_2B`: Invoice booked in books but not in 2B.
- `MISSING_IN_PR`: Invoice in 2B but missing in purchase register.
- `MISMATCHED`: Breaks down into `VALUE_MISMATCH`, `TAX_MISMATCH`, `DATE_MISMATCH`, and `TAX_RATE_MISMATCH`.
- `SUPPLIER_FLAGGED`: Supplier status is inactive/cancelled.
- `INVOICE_FORMAT_MISMATCH`: An informational annotation applied to fuzzy matches; does not block the `MATCHED` status.

## 5. Reconciliation Results for 082026

**Summary from `ITCReconciliationRun`:**
- **Total Purchase Invoices (Books):** 12
- **Total 2B Invoices (Portal):** 11

| Status | Count |
| :--- | :--- |
| **MATCHED** | 8 |
| **MISSING_IN_2B** | 1 |
| **MISSING_IN_PR** | 1 |
| **VALUE_MISMATCH** | 1 |
| **TAX_MISMATCH** | 0 |
| **DATE_MISMATCH** | 1 |
| **TAX_RATE_MISMATCH** | 1 |
| **SUPPLIER_FLAGGED** | 0 |

## 6. Observations and Control Notes
- **Critical Mismatches:** One high-value invoice (INV-009) is `MISSING_IN_2B`. This represents a supplier who hasn't filed GSTR-1. Follow-up is required.
- **Tolerances Functioning:** Several invoices matched using the fuzzy alphanumeric logic and within the ₹1.00 rounding tolerance, correctly avoiding false-positive mismatches.
- **Reversals Verification:** Reversals for Rule 37 (unpaid past 180 days) and Section 17(5) (expired stock adjustment) correctly bypassed the 2B reconciliation (as they reduce available ITC) and flowed directly to 4(B) in the 3B draft.

## 7. Mapping to GSTR-3B and Filing Implications

- **Net ITC Claimed:** The drafted GSTR-3B calculates Net ITC based on our books (Gross ITC - Reversals). 
- **2B as a Control:** MediFlow uses GSTR-2B strictly as a reference and control mechanism. It triggers warnings (`VAL-3B-008` Excess ITC claimed) if Net ITC in 3B exceeds GSTR-2B eligible ITC beyond the configured tolerance (₹100).
- **CA Discretion:** The system does **not** automatically defer or drop ITC claims for `MISSING_IN_2B` invoices. It presents the draft and the reconciliation report to the CA. Final decisions on whether to claim, defer, or reverse ITC rest with the CA during final filing on the portal.

## 8. Appendix: Sample Reconciliation Records

| Supplier GSTIN | Invoice No | Date | Taxable (₹) | Tax (₹) | Status | Mismatch Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 27AAAAA1234A1Z5 | INV-001 | 2026-08-01 | 10,000.00 | 1,800.00 | MATCHED | – |
| 27BBBBB1234B1Z5 | INV-009 | 2026-08-05 | 5,000.00 | 900.00 | MISSING_IN_2B | – |
| 27CCCCC1234C1Z5 | INV-010 | 2026-08-10 | 8,000.00 | 1,440.00 | MISMATCHED | VALUE_MISMATCH (2B: 7,500.00) |
| 27DDDDD1234D1Z5 | INV-011 | 2026-08-12 | 2,000.00 | 360.00 | MISMATCHED | TAX_RATE_MISMATCH (2B: 12%) |
| 27EEEEE1234E1Z5 | INV-012 | 2026-08-15 | 12,000.00 | 2,160.00 | MATCHED | INVOICE_FORMAT_MISMATCH |
