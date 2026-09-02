# GST Transaction Rule Audit Report
**Date:** 2026-08-21
**Reviewer:** AGENT 2 (GST calculation and transaction lifecycle agent)
**Scope:** `apps/billing`, `apps/inventory`, `apps/purchases`, `apps/reports`

## 1. Executive Summary
This audit validates the GST calculation and transaction lifecycle rules implemented in MediFlow, ensuring compliance with Indian GST regulations. The logic across purchases, sales, returns, and inventory adjustments has been reviewed.

## 2. Intra-State vs Inter-State & Tax Computations
- **Classification Logic:** The system determines inter-state vs. intra-state by comparing the outlet's state code with the distributor's or customer's state code (`_determine_interstate` in `gst_snapshot_service.py`). 
- **Tax Breakdown:** 
  - If Inter-State: `IGST = gst_amt` and `CGST = SGST = 0`.
  - If Intra-State: `CGST = gst_amt / 2` and `SGST = gst_amt / 2`.
  - This calculation accurately reflects Indian GST requirements and is handled safely using python's `Decimal` types rounded to `0.01` (`quantize(Decimal('0.01'))`).

## 3. B2B, B2C, Exempt, and Nil-Rated Classifications
- **B2B vs B2C:** B2B classification is robust, triggered dynamically by the presence of a `GSTIN`. B2CL (Business to Consumer Large) is correctly segregated from B2CS based on inter-state conditions and the invoice value exceeding the ₹2,50,000 threshold (`B2CL_THRESHOLD`).
- **Exempt / Nil-Rated Issue [BUG DETECTED]:** 
  - In `gst_snapshot_service.py`, `is_exempt` is evaluated for `PurchaseInvoice` but **omitted** for `SaleInvoice` snapshots. 
  - Consequently, in `gstr_builders.py`, `json_data.get('is_exempt', False)` defaults to `False` for sales. 
  - A domestic pharmacy selling 0% GST (exempt/nil-rated) medicines will have these items erroneously classified as `is_zero_rated` (which strictly applies to Exports/SEZ under GST Table 3.1(b)) rather than `osup_nil_exmp` (Table 3.1(c)).
  - **Recommendation:** Map product `schedule_type` or inject an explicit `is_exempt` flag into the `SaleInvoice` snapshot JSON.

## 4. Document Linking & Tax Reversal in Returns
- **Sales Return (Credit Note):** 
  - Original document links are preserved. `create_sales_return_snapshots` includes `original_invoice_id`, `original_invoice_no`, and `original_invoice_date`.
  - Tax reverses proportionally based on `qty_returned * return_rate`. 
- **Purchase Return (Debit Note) [BUG DETECTED]:**
  - While `DebitNote` models a `purchase_invoice` foreign key, `create_purchase_return_snapshots` **fails to store** `original_invoice_id` and `original_invoice_no` into the `snapshot_json`. 
  - **Recommendation:** Add the original document references into the `purchase_return` snapshot payload so the GSTR builder can report the corresponding original invoice in CDNR correctly.

## 5. Expired/Destroyed Goods and Rule 37 Tracking
- **Expired/Destroyed Goods (Section 17(5)(h)):**
  - Managed via `StockAdjustment` with `gstr_reason_code='SECTION_17_5_H'`. 
  - Integrated beautifully in `gstr_builders.py` where approved adjustments reverse ITC directly under **Table 4(B)(1)** (Rule 42, 43, 17(5)).
- **Rule 37 Tracking (Unpaid Invoices > 180 Days):**
  - `Rule37Adjustment` correctly orchestrates 180-day ITC risk tracking. 
  - Proportional unpaid ratios are utilized to reverse IGST/CGST/SGST amounts safely.
  - Plugs cleanly into **Table 4(B)(2)** (Others) for reversals, and **Table 4(A)(5) / 4(D)(1)** upon re-availment after subsequent payment.

## 6. Discounts and FEFO Batch Logic
- **Batching:** `fefo_batch_select` successfully utilizes `SELECT FOR UPDATE` to avoid double-deductions and correctly respects First-Expiry-First-Out logic.
- **Discounts:** Taxes are calculated off the `taxable_amount` which is appropriately derived *after* subtracting `discount_amount` from `subtotal`, complying with section 15(3) of the CGST Act.

## Conclusion
The transactional logic heavily favors compliance, especially concerning Rule 37 and 17(5)(h) ITC reversals. Fixing the snapshot JSON payloads (specifically adding the `is_exempt` flag for Sales and `original_invoice_id` for Debit Notes) will achieve total GSTR reporting parity.
