# Expected Results - GST QA Validation

This document outlines the expected outcomes for the 7-day deterministic GST scenario matrix. It serves as the baseline for evaluating test and fixture outputs.

## Day 1: Basic Operations (Intra-state)
- **Expected Ledger Impact:**
  - Sales: Output CGST and Output SGST ledgers credited.
  - Purchases: Input CGST and Input SGST ledgers debited.
- **Tax Calculation:** Total Tax = (Base Amount * CGST%) + (Base Amount * SGST%).
- **Validation:** SGST and CGST values must be exactly equal. No IGST must be applied.

## Day 2: Inter-state Operations
- **Expected Ledger Impact:**
  - Sales: Output IGST ledger credited.
  - Purchases: Input IGST ledger debited.
- **Tax Calculation:** Total Tax = Base Amount * IGST%.
- **Validation:** No CGST or SGST applied on these transactions. IGST rate must equal combined CGST+SGST rate for the item.

## Day 3: B2B, B2C, and Exempt Transactions
- **Expected Ledger Impact:**
  - B2B: Invoices flagged as B2B, customer GSTIN captured and verified for format.
  - B2C: Invoices categorized correctly as B2CS (small) or B2CL (large - strictly >₹2.5L and inter-state).
  - Exempt: Tax amount = 0. No tax ledger impact for exempt line items. Total invoice amount equals base amount for those lines.

## Day 4: Returns (Sales and Purchase)
- **Expected Ledger Impact:**
  - Sales Return (Credit Note): Output tax ledgers debited (reversal). Cost of Goods Sold reversed, stock value increased.
  - Purchase Return (Debit Note): Input tax ledgers credited (reversal). Stock value decreased.
- **Tax Calculation:** Tax reversed must exactly match the rate applied on the original referenced invoice.

## Day 5: Credit/Debit Notes (Value Adjustments)
- **Expected Ledger Impact:**
  - Value Credit Note (Sales): Output tax liability reduced proportionally to the discount/value reduction.
  - Value Debit Note (Purchase): Input tax credit increased or reduced appropriately based on the adjustment direction.
- **Validation:** Adjustments accurately reflect in reporting (e.g., GSTR-1 for Credit Notes) and no stock quantities are affected.

## Day 6: Payments, Receipts, and Advances
- **Expected Ledger Impact:**
  - Bank/Cash ledgers updated correctly.
  - Debtor/Creditor balances reduced precisely by the payment amount.
- **Validation:** If GST on advance is applicable (e.g., for certain services), tax liability is booked upon receipt and appropriately adjusted upon final invoice generation.

## Day 7: Pharmacy Specifics (Batch/Expiry)
- **Expected Ledger Impact:**
  - Exact batch quantities reduced on sale. FIFO/FEFO rules respected.
  - Returns of expired goods map directly to a quarantined or "Expired Stock" status/warehouse.
- **Validation:** If expired stock is destroyed/written-off, ITC previously claimed on those goods must be reversed as per GST Section 17(5)(h).
