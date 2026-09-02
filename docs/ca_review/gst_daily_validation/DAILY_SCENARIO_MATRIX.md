# Daily Scenario Matrix - GST QA Validation

This matrix defines a 7-day deterministic controlled GST QA scenario suite for the MediFlow ERP. This suite acts as a specification for upcoming automated test fixtures and management commands.

## Day 1: Basic Operations (Intra-state)
- **Objective:** Validate basic intra-state transactions (CGST + SGST).
- **Scenarios:**
  - Create a standard B2B sales invoice within the same state.
  - Create a standard B2B purchase invoice from a supplier in the same state.
  - Apply standard GST rates (e.g., 12%, 18%).
- **Data Points:** Patient/Customer State == Clinic State.

## Day 2: Inter-state Operations
- **Objective:** Validate inter-state transactions (IGST).
- **Scenarios:**
  - Create a B2B sales invoice for a customer in a different state.
  - Create a B2B purchase invoice from a supplier in a different state.
  - Verify IGST calculation instead of CGST/SGST.
- **Data Points:** Patient/Customer State != Clinic State.

## Day 3: B2B, B2C, and Exempt Transactions
- **Objective:** Validate GST behavior across different customer types and exempt items.
- **Scenarios:**
  - Create B2B sales invoices with valid customer GSTIN provided.
  - Create B2C Large (> ₹2.5L inter-state) and B2C Small invoices.
  - Sell and purchase GST-exempt or NIL-rated items in mixed invoices.
- **Data Points:** Transactions mixed with taxable and exempt line items, checking customer classification.

## Day 4: Returns (Sales and Purchase)
- **Objective:** Validate GST reversal and stock impact on returns.
- **Scenarios:**
  - Process a sales return (Credit Note issuance) linked to a Day 1/Day 2 invoice.
  - Process a purchase return (Debit Note issuance) linked to a Day 1/Day 2 purchase.
  - Check GST reversal entries (CGST/SGST or IGST based on the original invoice).

## Day 5: Credit/Debit Notes (Value Adjustments)
- **Objective:** Validate standalone financial credit and debit notes.
- **Scenarios:**
  - Issue a Credit Note for a post-sale discount (without stock movement).
  - Receive a Debit Note from a supplier for a price escalation.
  - Verify correct GST adjustment for value changes.

## Day 6: Payments, Receipts, and Advances
- **Objective:** Validate GST on advances (if applicable) and payment tracking.
- **Scenarios:**
  - Record receipt of advance payment against a future sales invoice.
  - Record payment made to a supplier against specific invoices.
  - Validate invoice-to-payment matching, outstanding balances, and aging.

## Day 7: Pharmacy Specifics (Batch/Expiry)
- **Objective:** Validate batch tracking, expiry management, and their interaction with GST rules.
- **Scenarios:**
  - Sell items from specific batches with different expiry dates.
  - Process returns for expired stock (expired return credit note).
  - Verify stock valuation and GST implications (ITC reversal) of written-off expired stock.
