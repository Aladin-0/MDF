# MediFlow Invariant Matrix

The Invariant Matrix defines the unbreakable rules and constraints of the MediFlow platform. These invariants are strictly guarded by Pytest tests and database constraints.

## 1. Accounting Invariants (Double-Entry Ledger)
- **Zero-Sum Rule:** `SUM(debits) = SUM(credits)` across the entire system.
- **Journal Balance:** Every `JournalEntry` must have exactly matching total debit and credit amounts across its `JournalLine`s.
- **Invoice-Payment Integrity:** For any Sales/Purchase Invoice, the sum of applied `PaymentAllocations` cannot exceed the `grand_total` of the invoice. Overpayment is structurally impossible.
- **Cash Flow Tracking:** Every cash sale directly increases the `Cash-in-Hand` ledger. Every credit sale increases the `Sundry Debtors` ledger.

## 2. Inventory Invariants (Stock Ledger)
- **Append-Only Ledger:** `StockLedger` entries can NEVER be updated or deleted. To correct mistakes, reversing entries (e.g., negative adjustment or return) must be logged.
- **Running Balance Accuracy:** A `StockLedger` entry's `running_qty` must exactly equal the chronological sum of all prior `qty_in` minus `qty_out` for that batch.
- **Non-Negative Stock:** `Batch.qty_strips` and `Batch.qty_loose` can never drop below zero. Handled via Django CheckConstraints and application-level locks.
- **Batch-Product Linkage:** While `MasterProduct` provides metadata, all stock is tracked at the `Batch` level. A batch can optionally detach from `MasterProduct` (Custom Product Mode) but cannot detach from its `Outlet`.

## 3. GST Calculation Invariants
- **Intra-state Supply:** If Outlet State == Customer/Supplier State, `IGST = 0`, and the tax is evenly split: `CGST = SGST = (Taxable Value * Rate) / 2`.
- **Inter-state Supply:** If Outlet State != Customer/Supplier State, `CGST = SGST = 0`, and `IGST = (Taxable Value * Rate)`.
- **Rounding:** Tax splits are rounded to two decimal places. A maximum `round_off` of `±0.50` is permitted to align the final `grand_total` to the nearest whole rupee.

## 4. API Integrity Invariants
- **Race Condition Prevention:** Any API endpoint modifying stock or payments uses `select_for_update()` to enforce row-level locking.
- **Atomic Operations:** All critical transactions (saving a bill, revising a bill) are wrapped in `transaction.atomic()`. Any failure results in a full rollback, preventing partial/dirty states.
- **Tenant Isolation:** All models query by `outlet`. A user from Outlet A cannot read, modify, or leak data belonging to Outlet B.

## 5. Purchase Workflow Invariants
The purchase workflow is strictly bound by mathematical and state invariants across creation, editing, and returns.

- **Purchase Creation Invariants:** 
  - *Landing Price Accuracy:* The landing price per unit must exactly equal `(Purchase Rate - Discount) + Freight + Cess`.
  - *Ledger Accuracy:* Cash purchases must debit Inventory and credit `Cash-in-Hand`. Credit purchases must credit the `Supplier Ledger`. 
  - *Unit Scaling:* Multi-unit scaling (e.g., Strips/Bottles) must compute total batch stock accurately based on multiplier.
- **Purchase Editing & Stock Correction Invariants:**
  - *Negative Stock Prevention:* A purchase invoice edited downwards cannot reduce a batch's stock below what has already been sold. Attempting to reduce quantity below the sold amount is blocked by `test_purchase_edit_stock.py`.
  - *Audit Reasons:* All structural edits must carry a recorded audit reason.
- **Purchase Return Invariants:**
  - *Supplier & Ledger Debit:* A purchase return must immediately debit the Supplier Ledger and credit the Purchase Return ledger.
  - *Stock Reversal:* Returning a purchase strictly decrements the corresponding inventory `Batch`.
  - *Edit Constraints:* Modifying a return recalculates stock impacts seamlessly without breaking the chronological ledger.
- **Concurrency & Rollback Invariants:**
  - *Target Lock:* Any modification to existing stock or returns must obtain a `select_for_update()` lock to prevent race conditions during concurrent requests.
  - *Atomic Safety:* Failures during creation or return must result in a complete `transaction.atomic()` rollback of all inventory and ledger models, preventing dirty states.
