# GSTR-3B CA Review Note

## 1. Scope of GSTR-3B Draft
This draft GSTR-3B JSON output covers the following tables:
- **Table 3.1**: Outward and reverse charge inward supplies (mapped via transaction snapshots).
- **Table 3.2**: Inter-state supplies made to unregistered persons, composition taxable persons, and UIN holders.
- **Table 4**: Eligible ITC and ITC Reversals (incorporating automated reversals for Rule 37, Rule 42/43, and Section 17(5)).

**Boundary Note**: This data is strictly a "working draft" provided for CA/GSP review. The application does **not** directly file to the GSTN portal.

**Schema Note (Rule 37 Reclaims)**: As per GSTN schema and CA guidance, Rule 37 reclaims are now mapped to the root-level `other_details` array as `"ITC reclaimed which was reversed under Table 4(B)(2) in earlier tax period"`, and are excluded from the `itc_inelg` array.

## 2. ITC Reconciliation Approach (GSTR-2B)
The reconciliation engine compares internal purchase snapshots with portal-fetched GSTR-2B data.

**Match Keys:**
- Exact: `[Supplier GSTIN]` + `[Invoice Number]` + `[Period]`
- Fuzzy: `[Supplier GSTIN]` + `[Stripped Invoice Number]` (Non-alphanumeric chars removed, leading zeros stripped).

**Tolerances:**
- **Value/Tax Tolerance**: ± ₹1.00 (Configurable)
- **Date Tolerance**: ± 2 Days (Configurable)
- **Tax Rate Tolerance**: ± 1% effective tax rate difference (Configurable)

**Mismatch Categories (`ITCReconciliationResult.match_status`):**
- `MISSING_IN_2B`: Invoice present internally but absent in 2B.
- `MISSING_IN_PR`: Invoice present in 2B but missing internally.
- `MISMATCHED`: Mismatches in `VALUE_MISMATCH`, `TAX_MISMATCH`, `DATE_MISMATCH`, `TAX_RATE_MISMATCH`.
- `SUPPLIER_FLAGGED`: Supplier status is not Active.

*(Note: `INVOICE_FORMAT_MISMATCH` is treated as a non-blocking annotation, retaining `MATCHED` status).*

## 3. Implemented Validation Rules
The `GSTR3BValidator` ensures data integrity before the draft is generated.

**Blocking Errors (Prevents Export):**
- **VAL-3B-001 (3B-3.1-001 / 3B-4B-001)**: Negative values in Outward supplies or ITC Reversals.
- **VAL-3B-005**: Table 3.2 IGST cannot exceed Table 3.1(a) IGST.
- **VAL-3B-009**: Total ITC reversed cannot exceed Gross ITC available.
- **VAL-3B-013**: Liability mismatch between GSTR-3B and GSTR-1 exceeding the ₹100 tolerance.

**Warnings (Requires Review):**
- **VAL-3B-002**: Liability shortfall vs GSTR-1.
- **VAL-3B-008**: Net ITC claimed exceeds GSTR-2B eligible ITC.
- **VAL-3B-014**: Large ITC reversal spike (> 50%) compared to the prior period.

**Informational (Metrics & Audit):**
- **VAL-3B-011**: Summarized ineligible ITC reversed under Section 17(5).
- **VAL-3B-015**: 2B Reconciliation metrics (Missing vs. Mismatched counts).

## 4. Known Limitations & Assumptions
- **Mock GSTR-2B**: Test environments currently use mock GSTR-2B responses since live GSTN sandbox access is simulated.
- **Direct Apportionment**: Common credit reversals under Rule 42/43 rely on predefined percentage allocations that must be maintained in the UI.
