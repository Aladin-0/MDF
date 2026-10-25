# INVOICE MODIFICATION (REVISE) END-TO-END DATAFLOW REPORT

## Executive Summary
This document provides an architectural trace of the **Invoice Modification (Revise)** flow in MediFlow. It outlines the complete lifecycle from the moment a user clicks **"Edit"** on a historical invoice, through hydration, client-side store state recalculation, revision payload construction, API endpoint validation, and the transactional database update and ledger re-posting sequence.

---

## 1. Lifecycle Flowchart

```text
[Database: SaleInvoice & SaleItem]
       │
       ▼  (1) GET /api/v1/sales/<id>/?outletId=...
[Backend: SaleDetailView.get()]
  apps/backend/apps/billing/views.py
       │
       ▼  (2) JSON Response (Serialized Invoice + Items)
[Frontend Hydrator: EditSaleHydrator.tsx]
  apps/frontend/components/billing/EditSaleHydrator.tsx
       │
       ▼  (3) store.addToCart() & store.updateDraftHeader()
[Frontend Zustand Store & Calc Engine: billingStore.ts]
  apps/frontend/store/billingStore.ts  <──>  apps/frontend/lib/billingMarginUtils.ts
       │                                     (distributeSmartDiscounts / getDraftTotals)
       ▼  (4) User Edits Items / Discard / Save -> executeCheckout()
[Frontend Hook: useCheckout.ts / useSaveBill.ts]
  apps/frontend/hooks/useSaveBill.ts
       │
       ▼  (5) buildSalePayload()
[Frontend Payload Builder: payloadBuilders.ts]
  apps/frontend/utils/payloadBuilders.ts
       │
       ▼  (6) POST /api/v1/sales/<id>/revise/
[Backend View: SaleReviseView.post()]
  apps/backend/apps/billing/views.py
       │
       ▼  (7) atomic_sale_update()
[Backend Atomic Service: sale_update_service.py]
  apps/backend/apps/billing/sale_update_service.py
       │
       ├─► Revert Old Stock (StockLedger & Batch)
       ├─► Revert Old Accounting (CreditTransaction & JournalEntry)
       ├─► Deduct New Stock & Update SaleItems
       ├─► Re-derive GST & Round Off
       ├─► Post Customer Ledger & Rebuild Running Balances
       ├─► Post General Ledger (post_sale_invoice -> JournalEntry)
       └─► Rebuild Stock Ledger
       │
       ▼  (8) Post-update Snapshot & Audit Recording
[Backend Audit Orchestrator: orchestrator.record_revision()]
  apps/audit/core/orchestrator.py
       │
       ▼
[Database: Updated SaleInvoice, SaleItems, JournalEntry, StockLedger]
```

---

## 2. Key Functions Map (Steps 1 through 5)

| Step | Architectural Role | Exact File Path | Function / Class Name | Primary Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | **Backend Read Endpoint** | [`apps/backend/apps/billing/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py) | `SaleDetailView.get()` | Queries `SaleInvoice` and `SaleItem`, serializes invoice header, payments, returns, and items list (`mrp`, `saleRate`, `rate`, `discountPct`, `taxableAmount`, `gstAmount`, `totalAmount`). |
| **Step 1** | **Frontend Hydrator** | [`apps/frontend/components/billing/EditSaleHydrator.tsx`](file:///home/asta/coding/MDF/apps/frontend/components/billing/EditSaleHydrator.tsx) | `EditSaleHydrator()` (`hydrate()`) | Listens to `?edit=<id>`, queries `/api/v1/sales/<id>/`, creates or resets draft, sets `editingSaleId`, initializes header (`saleType`, `billingBasis`, `invoiceDate`), maps `extraDiscountPct`, and pushes items into the cart via `store.addToCart()`. |
| **Step 2** | **Frontend Cart & State Store** | [`apps/frontend/store/billingStore.ts`](file:///home/asta/coding/MDF/apps/frontend/store/billingStore.ts) | `addToCart()`, `updateCartItem()`, `setSaleType()`, `setExtraDiscountPct()` | Manages cart state in Zustand, applies item updates, and recalculates row math on mode changes. |
| **Step 2** | **Frontend Calculation Engine** | [`apps/frontend/store/billingStore.ts`](file:///home/asta/coding/MDF/apps/frontend/store/billingStore.ts)<br>[`apps/frontend/lib/billingMarginUtils.ts`](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts) | `getDraftTotals()`<br>`distributeSmartDiscounts()` | Calculates bill totals. For Retail, computes inclusive tax; for Wholesale, computes exclusive tax. Distributes bill-level discounts with margin protection caps. |
| **Step 3** | **Checkout Orchestration** | [`apps/frontend/hooks/useCheckout.ts`](file:///home/asta/coding/MDF/apps/frontend/hooks/useCheckout.ts)<br>[`apps/frontend/hooks/useSaveBill.ts`](file:///home/asta/coding/MDF/apps/frontend/hooks/useSaveBill.ts) | `executeCheckout()`<br>`saveBill()` | Triggers revision modal if needed, sets payment grand total, resolves active staff/outlet, calls `buildSalePayload()`, and dispatches `salesApi.revise(editingSaleId, payload)`. |
| **Step 3** | **Payload Construction** | [`apps/frontend/utils/payloadBuilders.ts`](file:///home/asta/coding/MDF/apps/frontend/utils/payloadBuilders.ts) | `buildSalePayload()` | Transforms Zustand draft and computed totals into the backend API contract format for `items`, `payments`, `scheduleHData`, and revision metadata. |
| **Step 4** | **Backend Routing & View Guard** | [`apps/backend/apps/billing/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py) | `SaleReviseView.post()` | Validates revision permissions (`has_bill_revision_permission`), validates eligibility (returns/receipts), captures `old_snapshot`, routes to `atomic_sale_update()`, records revision in `BillRevision`, and writes activity logs. |
| **Step 5** | **Backend Atomic Transaction Service** | [`apps/backend/apps/billing/sale_update_service.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/sale_update_service.py) | `atomic_sale_update()` | Locks `SaleInvoice` and `Batch` rows; reverts old stock and accounting; deducts new batch stock; updates/creates `SaleItem` records; re-derives server GST; recreates `InvoicePayment`; posts credit transactions, customer ledger entries, and general ledger journal entries; and triggers stock ledger rebuilds. |

---

## 3. Detailed Step-by-Step Dataflow

### Step 1: Frontend Hydration (DB -> UI)
- **Trigger:** Navigating to `/billing?edit=<sale_uuid>`.
- **API Call:** `GET /api/v1/sales/<sale_uuid>/?outletId=<outlet_uuid>` handled by `SaleDetailView.get()`.
- **API Response Structure:**
  - Header: `invoiceNo`, `invoiceDate`, `saleType`, `subtotal`, `discountAmount`, `extraDiscountPct`, `taxableAmount`, `cgstAmount`, `sgstAmount`, `grandTotal`, `payments`.
  - Items Array (`items_list`):
    ```json
    {
      "batchId": "...",
      "productId": "...",
      "name": "...",
      "packSize": 10,
      "mrp": 100.0,
      "saleRate": 100.0,
      "rate": 100.0,
      "qtyStrips": 1,
      "qtyLoose": 0,
      "discountPct": 0.0,
      "gstRate": 12.0,
      "taxableAmount": 89.29,
      "gstAmount": 10.71,
      "totalAmount": 100.0,
      "purchaseRate": 60.0,
      "landingRate": 63.0,
      "ptr": 70.0,
      "pts": 65.0
    }
    ```
- **Mapping into Store (`EditSaleHydrator.tsx`):**
  1. `store.setEditingSaleId(editId)`
  2. `store.setRevisionContext('paid_bill_correction', '', '')`
  3. `store.updateDraftHeader(targetDraftId, { saleType: fullInvoice.saleType || 'RETAIL', billingBasis: fullInvoice.billingBasis || 'mrp', invoiceDate })`
  4. `store.setExtraDiscountPct(Number(fullInvoice.extraDiscountPct ?? fullInvoice.extra_discount_pct ?? 0))`
  5. Iterates `fullInvoice.items`:
     - Determines `baseRate = isWholesale ? (pts || ptr || mrp) : mrp;`
     - Invokes `store.addToCart()` with:
       - `saleRate: baseRate`
       - `rate: baseRate` (ensures un-discounted base rate is loaded)
       - `mrp: mrp`
       - `discountPct: Number(item.discountPct ?? item.discount_pct ?? 0)`
       - `totalQty: qtyStrips + (qtyLoose / packSize)`

---

### Step 2: Frontend Calculation Engine (UI State)
- **Function:** `getDraftTotals(id)` in `apps/frontend/store/billingStore.ts`.
- **Process for Each Item in Cart:**
  1. `effectiveRate = item.rate || (saleType === 'WHOLESALE' ? (item.pts || item.ptr || item.mrp) : item.mrp) || 0;`
  2. Computes **Pre-extra-discount values** (`preExtraNet`):
     - **Wholesale (Exclusive Tax):** `rowTaxablePre = totalQty * effectiveRate; rowPreExtraNet = rowTaxablePre * (1 + gstRate / 100);`
     - **Retail (Inclusive Tax):** `rowPreExtraNet = totalQty * effectiveRate;`
  3. Computes **Post-extra-discount values** (`netPayable`):
     - If `extraDiscountPct > 0`, calls `distributeSmartDiscounts(cart, extraDiscountPct, saleType, landingCostIncludeGst)`:
       - Checks item margin vs. landing cost; caps discount if it breaches minimum profit threshold; dynamically redistributes excess discount across eligible unconstrained rows.
       - Returns `alloc.finalRowAmount` and `alloc.finalTaxable`.
     - **Fallback (No smart allocations / zero extra discount):**
       - **Wholesale:** `rowTaxable = totalQty * effectiveRate * discountFactor; rowNetPayable = rowTaxable * (1 + gstDecimal);`
       - **Retail:** `rowNetPayable = totalQty * effectiveRate * discountFactor; rowTaxable = rowNetPayable / (1 + gstDecimal);`
  4. Aggregates:
     - `subtotal = totalTaxableValue`
     - `itemDiscountAmount = Math.max(0, totalMrp - preExtraNet)`
     - `extraDiscountAmount = Math.max(0, preExtraNet - netPayable)`
     - `grandTotal = saleType === 'WHOLESALE' ? exactTotal : Math.round(exactTotal)`
     - `roundOff = grandTotal - exactTotal`

---

### Step 3: Frontend Payload Generation (UI -> API)
- **Functions:** `saveBill()` in [`useSaveBill.ts`](file:///home/asta/coding/MDF/apps/frontend/hooks/useSaveBill.ts) -> `buildSalePayload()` in [`payloadBuilders.ts`](file:///home/asta/coding/MDF/apps/frontend/utils/payloadBuilders.ts).
- **Exact Item Payload Format (`items` array sent to `/revise/`):**
  ```json
  {
    "batchId": "UUID",
    "productId": "UUID",
    "name": "Product Name",
    "batchNo": "BATCH123",
    "expiryDate": "2027-12-31",
    "qtyStrips": 2,
    "qtyLoose": 0,
    "freeQtyStrips": 0,
    "freeQtyLoose": 0,
    "saleMode": "strip",
    "packSize": 10,
    "mrp": 120.0,
    "applied_ptr": 80.0,
    "applied_pts": 75.0,
    "rate": 120.0,
    "discountPct": 0.0,
    "gstRate": 12.0,
    "scheduleType": "OTC",
    "taxableAmount": 214.29,
    "gstAmount": 25.71,
    "totalAmount": 240.0
  }
  ```
- **Header Payload:**
  - `subtotal`: Subtotal taxable value.
  - `discountAmount`: Sum of `itemDiscountAmount + extraDiscountAmount`.
  - `extraDiscountPct`: Bill-level extra discount percentage.
  - `taxableAmount`, `cgstAmount`, `sgstAmount`, `igstAmount`, `roundOff`, `grandTotal`.
  - `paymentMode`: `'cash' | 'upi' | 'card' | 'credit' | 'split'`.
  - `payments`: Detailed tender breakdown array `[{ method, amount }]`.
  - `revisionAction`: e.g., `'paid_bill_correction'`, `'commercial_correction'`, `'header_correction'`, `'direct_revise'`.
  - `revisionReasonCode`: Code indicating reason (e.g., `'RATE_ERR'`, `'QTY_ERR'`).
  - `revisionReasonText`: Mandatory user explanation text.

---

### Step 4: Backend Routing & View Validation (API -> Backend)
- **File & Class:** [`apps/backend/apps/billing/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py) -> `SaleReviseView(APIView)`.
- **Validation Checklist Before Service Call:**
  1. **Authentication & Tenant:** Ensures `request.user` is authenticated and resolves `outletId`.
  2. **Invoice Existence & Cancellation Guard:** Rejects with 404 if not found; rejects with 400 if `invoice.is_cancelled == True`.
  3. **Revision Context:** Requires `revisionAction`, `revisionReasonCode`, and non-empty `revisionReasonText`.
  4. **Item Non-Emptiness:** Ensures `items` has at least 1 item unless `revisionAction == 'header_correction'`.
  5. **Granular Revision Permissions (`has_bill_revision_permission`):**
     - `'direct_revise'` -> requires `can_modify_draft_bill` (rejects if `amount_paid > 0`).
     - `'commercial_correction'` -> requires `can_modify_unpaid_bill` (rejects if `amount_paid > 0`).
     - `'paid_bill_correction'` -> requires `can_modify_paid_bill`.
     - `'return_aware_correction'` -> requires `can_modify_bill_with_return`.
     - `'header_correction'` -> requires `can_correct_header_fields`.
     - `'cancel_and_reissue'` -> requires `can_cancel_and_reissue_bill`.
  6. **Business Constraint Eligibility:**
     - If invoice has returns, blocks actions other than `return_aware_correction` and `header_correction`.
     - If invoice has later receipt allocations, blocks actions other than `paid_bill_correction` and `header_correction`.
  7. **Audit Snapshot Pre-Capture:** Calls `SnapshotBuilderRegistry.build_snapshot(invoice)` to preserve the before-modification state.
  8. **Service Invocation:** Calls `atomic_sale_update(sale_id, request.data, outlet_id, str(request.user.id))`.

---

### Step 5: Backend Atomic Service (Backend -> DB)
- **File & Function:** [`apps/backend/apps/billing/sale_update_service.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/sale_update_service.py) -> `atomic_sale_update()`.
- **Atomic Database Execution Sequence:**

```text
1. Lock Invoice:
   SaleInvoice.objects.select_for_update().get(id=sale_id, outlet=outlet)

2. Header Correction Short-Circuit:
   If revisionAction == 'header_correction', validates client_grand_total == db.grand_total,
   updates only customer/doctor/invoice_date/billed_by/sale_type, saves, and returns early.

3. Payment & Tender Reconciliation:
   Parses payments array or legacy tender fields; validates sum(payments) == client_grand_total.

4. Schedule H Validation:
   Calls schedule_h_validate(cart_items, schedule_h_data) if prescription items exist.

5. Pre-Lock Batches in Sorted UUID Order:
   Selects for update all old and new batch IDs ordered by ID (prevents deadlock).

6. Revert Old Stock:
   - Deletes existing StockLedger rows (voucher_number=invoice_no, txn_type='SALE_OUT').
   - Restores qty_strips and qty_loose back into each old item's Batch (using batch.pack_size).

7. Revert Old Accounting:
   - Decrements customer total_purchases by old grand_total.
   - Deletes old CreditTransaction records and decrements credit_account total_outstanding/borrowed.
   - Reverses old JournalEntry lines (debiting credit_amount and crediting debit_amount via LedgerService).
   - Deletes old JournalEntry.

8. Deduct New Stock & Save/Update SaleItems:
   - Loops over items_data.
   - Deducts qty_strips and qty_loose from each Batch.
   - Validates stock sufficiency and return quantity limits (cannot reduce below returned qty).
   - Validates sale price (validate_sale_price).
   - Updates matching existing SaleItem OR creates new SaleItem with proposed rate, discount, gst, etc.
   - Posts new StockLedger entry (txn_type='SALE_OUT', voucher_type='Sale Invoice').

9. Cleanup Removed Items:
   - Deletes old items that were removed in the new cart (unless item has returns, which aborts).

10. Update SaleInvoice Header:
    - Updates customer, doctor, invoice_date, subtotal, discount_amount, extra_discount_pct,
      grand_total, payment_mode, cash_paid, upi_paid, card_paid, credit_given, amount_paid, amount_due.

11. Strict Boundary Validation & Payload Aggregation:
    - Verifies row math: `abs((item_taxable + item_gst) - item_total) <= 0.05` to prevent tampering.
    - Aggregates server_taxable, server_cgst, server_sgst, computed_item_total directly from validated rows.
    - Integrity check: ensures `abs(client_grand_total - computed_item_total) <= 2.00` to block round-off manipulation.
    - Sets invoice taxable_amount, cgst_amount, sgst_amount, igst_amount, round_off.
    - Saves SaleInvoice.

12. Recreate InvoicePayment Records:
    - Deletes old InvoicePayment child rows and creates new rows for each parsed tender.

13. Post Credit & Customer Ledger:
    - Creates CreditTransaction (debit/credit) with current_accounting_date.
    - Updates/creates LedgerEntry (sale and receipt) stamped with current_accounting_date.
    - Calls rebuild_customer_ledger() to restore continuous running balances.

14. Post General Ledger (JournalEntry):
    - Calls post_sale_invoice(sale_invoice) in journal_service.py.
    - Creates JournalEntry with multi-tender debit lines (Cash, UPI, Card, Customer Debtors)
      and credit lines (Sales Account, CGST Payable, SGST Payable).

15. Rebuild Stock Ledger:
    - Calls rebuild_stock_ledger() for each affected batch from the earliest transaction date.

16. Post-Update Snapshot & Audit Completion:
    - Takes new_snapshot.
    - Records orchestrator.record_revision() in BillRevision model.
    - Records orchestrator.record_activity() in ActivityLog.
```

---

## 4. The "Rate" Journey

Tracking how `mrp`, `rate`, and `discount` travel through the layers:

```text
1. DATABASE (SaleItem & Batch models)
   ├── Batch.mrp                     (Decimal, e.g., 100.00)
   ├── Batch.ptr / pts               (Decimal, e.g., 70.00 / 65.00)
   ├── SaleItem.mrp                  (Decimal: original MRP)
   ├── SaleItem.rate                 (Decimal: row base rate before bill discount)
   ├── SaleItem.sale_rate            (Decimal: legacy rate field, usually equals MRP)
   ├── SaleItem.discount_pct         (Decimal: line-item discount %)
   └── SaleInvoice.extra_discount_pct(Decimal: bill-level extra discount %)
             │
             ▼
2. BACKEND SERIALIZER (SaleDetailView.get())
   ├── 'mrp': float(item.mrp)
   ├── 'rate': float(item.rate)
   ├── 'saleRate': float(item.sale_rate)
   ├── 'discountPct': float(item.discount_pct)
   └── 'extraDiscountPct': float(invoice.extra_discount_pct or 0.0)
             │
             ▼
3. FRONTEND HYDRATION (EditSaleHydrator.tsx)
   ├── Reads: mrp = item.mrp, ptr = item.ptr, pts = item.pts
   ├── Resolves Base Rate:
   │     baseRate = isWholesale ? (pts || ptr || mrp) : mrp;
   ├── Cart Assignment:
   │     draft.cartItem.mrp = mrp
   │     draft.cartItem.saleRate = baseRate
   │     draft.cartItem.rate = baseRate           <-- Clean pre-discount base rate
   │     draft.cartItem.discountPct = item.discountPct
   └── Header Assignment:
         draft.extraDiscountPct = fullInvoice.extraDiscountPct ?? fullInvoice.extra_discount_pct ?? 0
             │
             ▼
4. FRONTEND CALCULATION ENGINE (billingStore.ts -> getDraftTotals())
   ├── effectiveRate = item.rate || (isWholesale ? pts/ptr : mrp)
   ├── Gross Row Total: totalQty * effectiveRate
   ├── Extra Discount Application:
   │     smartAllocations.get(item.batchId) -> finalRowAmount, finalTaxable
   └── Bill Discount Total:
         discountAmount = itemDiscountAmount (MRP - preExtraNet) + extraDiscountAmount (preExtraNet - netPayable)
             │
             ▼
5. FRONTEND PAYLOAD BUILDER (payloadBuilders.ts -> buildSalePayload())
   ├── Emits in items[i]:
   │     "mrp": item.mrp
   │     "rate": item.rate                        <-- Sent to backend
   │     "discountPct": item.discountPct          <-- Line discount %
   │     "taxableAmount": itemTaxable             <-- Computed post-discount taxable
   │     "gstAmount": itemGst                     <-- Computed GST amount
   │     "totalAmount": discountedTotal           <-- Net payable for row
   └── Emits in Header:
         "subtotal": totals.subtotal
         "discountAmount": totals.discountAmount + totals.extraDiscountAmount
         "extraDiscountPct": draft.extraDiscountPct
         "grandTotal": totals.grandTotal
             │
             ▼
6. BACKEND ATOMIC SERVICE (sale_update_service.py -> atomic_sale_update())
   ├── proposed_rate = Decimal(str(item_data.get('rate', batch.mrp)))
   ├── Price Validation: validate_sale_price(proposed_rate, batch)
   ├── SaleItem Persistence:
   │     existing_item.rate = proposed_rate
   │     existing_item.mrp = batch.mrp
   │     existing_item.discount_pct = item_data.get('discountPct')
   │     existing_item.taxable_amount = item_data.get('taxableAmount')
   │     existing_item.gst_amount = item_data.get('gstAmount')
   │     existing_item.total_amount = item_data.get('totalAmount')
   ├── StockLedger Persistence:
   │     StockLedgerEntry.rate = proposed_rate
   └── Strict Boundary Validation & Aggregation:
         Asserts: abs((item_taxable + item_gst) - item_total) <= 0.05
         server_taxable = sum(item_taxable)
         server_cgst = sum(item_cgst)
         server_sgst = sum(item_sgst)
         computed_item_total = sum(item_total)
         server_round_off = client_grand_total - computed_item_total
         Asserts: abs(server_round_off) <= 2.00
         sale_invoice.taxable_amount = server_taxable
         sale_invoice.cgst_amount = server_cgst
         sale_invoice.sgst_amount = server_sgst
         sale_invoice.round_off = server_round_off
```

---

## 5. Architectural Observations & Known Nuances

1. **GST Calculation Alignment (Boundary Auditing):**
   - **Frontend:** `payloadBuilders.ts` and `getDraftTotals()` allocate bill discount using `distributeSmartDiscounts()` which caps discounts on low-margin items and shifts excess discount to high-margin items.
   - **Backend:** `sale_update_service.py` Step 8 validates and aggregates the client's verified row-level `taxable_amount` and `gst_amount` directly, instead of attempting to blindly re-derive them with a flat pro-rata formula.
   - *Integrity Guarantees:* Two boundary checks ensure security:
     1. Row math verification: `abs((item_taxable + item_gst) - item_total) <= 0.05`.
     2. Invoice-level round-off capping: `abs(client_grand_total - computed_item_total) <= 2.00`.
   - *Impact:* Complete mathematical synchronization between what the user sees in the frontend cart and what is saved in the database, eliminating rounding drift and GST bucket distortion.

2. **Base Rate Preservation on Hydration:**
   - In previous iterations, `item.rate` was loaded with the post-discount row rate or derived from `totalDiscountAmount / totalRateAmount`, triggering a recursive "double discount".
   - The current hydration logic in `EditSaleHydrator.tsx` strictly forces `baseRate = isWholesale ? (pts || ptr || mrp) : mrp;` to ensure the draft starts from true pre-discount catalog rates.

3. **Accounting Date Desync Guard:**
   - In `atomic_sale_update()`, financial adjustments to `CreditTransaction` and `LedgerEntry` are explicitly assigned `current_accounting_date = datetime.now().date()`. This prevents retroactive distortion of historical daily sales summaries when an older bill is revised today.
