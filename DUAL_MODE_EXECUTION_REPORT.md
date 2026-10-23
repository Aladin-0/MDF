# DUAL-MODE MARGIN FLOOR EXECUTION REPORT (PHASE 2)

**Execution Date:** 2026-10-23  
**Status:** Completed & Fully Verified across Stack  
**Branch:** `feat/gst-2.0-updates`  
**Engineer:** Principal Full-Stack Engineer  

---

## 1. Executive Summary

Phase 2 of the **Dual-Mode Margin Floor Blueprint** has been implemented across MediFlow's frontend math engine, UI workspace, checkout safety hooks, backend pre-checks, and in-transaction validation services.

The system now enforces differentiated cost floors based on document mode:
- **Retail Sales (`saleType === 'RETAIL'`):** Cost floor is governed strictly by `landing_rate` (full landed cost including freight, taxes, and supplier charges), falling back to `ptr` > `purchase_rate`. Dynamic UI and error labels identify this as `"landing cost"`.
- **Wholesale Sales (`saleType === 'WHOLESALE'`):** Cost floor is governed strictly by `purchase_rate` (trade base cost), falling back to `pts` > `landing_rate` > `ptr`. Dynamic UI and error labels identify this as `"purchase rate"`.

All 71 frontend unit tests and all 7 backend API tests pass.

---

## 2. Part 1: Frontend Math & Store Execution

### 2.1 Math Engine Utilities Updated

#### `apps/frontend/lib/billingMarginUtils.ts`
1. **Signature Update:**
   - `calculateLineMargin(item: CartItem, extraDiscountPct: number = 0, saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL')`
   - `calculateTotalMargin(cart: CartItem[], billRevenue: number, billDiscountAmount: number = 0, extraDiscountPct: number = 0, saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL')`
2. **Branching Cost Floor Priority:**
   ```typescript
   let costFloor = 0;
   if (saleType === 'WHOLESALE') {
       if (rawPurchase > 0) costFloor = rawPurchase;
       else if (rawPts > 0) costFloor = rawPts;
       else if (rawLanding > 0) costFloor = rawLanding;
       else costFloor = rawPtr;
   } else {
       if (rawLanding > 0) costFloor = rawLanding;
       else if (rawPtr > 0) costFloor = rawPtr;
       else costFloor = rawPurchase;
   }
   ```
3. **Bill-Level Margin Propagation:**
   `calculateTotalMargin` forwards `saleType` to each item's `calculateLineMargin(item, extraDiscountPct, saleType)` call, ensuring consistent line and global loss detection.

#### `apps/frontend/lib/cartUtils.ts`
1. **Row Total Cost Prioritization:**
   In `calculateRowTotals(item, extraDiscountPct, saleType = 'RETAIL')`:
   ```typescript
   let rawCost = 0;
   if (saleType === 'WHOLESALE') {
       if (rawPurchase > 0) rawCost = rawPurchase;
       else if (rawPts > 0) rawCost = rawPts;
       else if (rawLanding > 0) rawCost = rawLanding;
       else rawCost = rawPtr;
   } else {
       if (rawLanding > 0) rawCost = rawLanding;
       else if (rawPtr > 0) rawCost = rawPtr;
       else rawCost = rawPurchase;
   }
   ```

---

### 2.2 Call Sites & UI Verification

All 3 call sites have been updated to inject `saleType`:

1. **`apps/frontend/components/billing/MainInvoiceWorkspace.tsx`**
   - **Line 126:** Passes `saleType` (`activeDraft?.saleType || 'RETAIL'`) to `calculateTotalMargin`.
   - **Line 795:** Passes `saleType` to `calculateLineMargin(item, activeDraft?.extraDiscountPct || 0, saleType)`.
   - **Lines 939–948 (Dynamic UI Badge):** Replaced static `"Below Landing Cost"` with dynamic badge:
     ```tsx
     <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded flex items-center gap-0.5 mt-0.5">
         {activeDraft?.saleType === 'WHOLESALE' ? 'Below Purchase Rate' : 'Below Landing Cost'} (₹{(item.landingRate ?? lineMargin.costFloor).toFixed(2)})
     </span>
     ```

2. **`apps/frontend/components/billing/RightBillingRail.tsx`**
   - **Line 85:** Passes `activeDraft.saleType || 'RETAIL'` and `extraDiscountPct` into `calculateTotalMargin`:
     ```typescript
     return calculateTotalMargin(
         activeDraft.cart,
         totals.grandTotal,
         totals.extraDiscountAmount,
         activeDraft.extraDiscountPct || 0,
         activeDraft.saleType || 'RETAIL'
     );
     ```
   - **Lines 550 & 581:** Dynamic banner text:
     ```tsx
     <span>
         Checkout Locked: One or more items are being sold below {activeDraft?.saleType === 'WHOLESALE' ? 'purchase rate' : 'landing cost'}.
     </span>
     ```

3. **`apps/frontend/hooks/useCheckout.ts`**
   - **Lines 66–70:** Extracted `saleType = draft?.saleType || 'RETAIL'` and passed to both `calculateTotalMargin` and `calculateLineMargin`:
     ```typescript
     const extraDiscPct = draft?.extraDiscountPct || 0;
     const saleType = draft?.saleType || 'RETAIL';
     const marginData = draft ? calculateTotalMargin(draft.cart, totals?.grandTotal, totals?.extraDiscountAmount, extraDiscPct, saleType) : null;
     const hasLossItem = draft ? draft.cart.some(item => calculateLineMargin(item, extraDiscPct, saleType).isLossSale) : false;
     ```

---

## 3. Part 2: Backend Security Execution

### 3.1 Views & Services Updated

#### `apps/backend/apps/billing/views.py`
1. **Pre-Check Block (`SaleCreateView` lines 645–693):**
   ```python
   if req_sale_type == 'WHOLESALE':
       if batch_obj.purchase_rate and batch_obj.purchase_rate > Decimal('0'):
           cost_floor = batch_obj.purchase_rate
       elif batch_obj.pts and batch_obj.pts > Decimal('0'):
           cost_floor = batch_obj.pts
       else:
           cost_floor = batch_obj.landing_rate or batch_obj.ptr or Decimal('0')
       floor_label = "purchase rate"
   else:
       if batch_obj.landing_rate and batch_obj.landing_rate > Decimal('0'):
           cost_floor = batch_obj.landing_rate
       elif batch_obj.ptr and batch_obj.ptr > Decimal('0'):
           cost_floor = batch_obj.ptr
       else:
           cost_floor = batch_obj.purchase_rate or Decimal('0')
       floor_label = "landing cost"
   ```
   - Dynamic error detail: `f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{cost_floor:.2f}."`

2. **In-Transaction Block (`SaleCreateView` lines 981–1015):**
   ```python
   if sale_type == 'WHOLESALE':
       if batch.purchase_rate and batch.purchase_rate > Decimal('0'):
           c_floor = batch.purchase_rate
       elif batch.pts and batch.pts > Decimal('0'):
           c_floor = batch.pts
       else:
           c_floor = batch.landing_rate or batch.ptr or Decimal('0')
       floor_label = "purchase rate"
   else:
       if batch.landing_rate and batch.landing_rate > Decimal('0'):
           c_floor = batch.landing_rate
       elif batch.ptr and batch.ptr > Decimal('0'):
           c_floor = batch.ptr
       else:
           c_floor = batch.purchase_rate or Decimal('0')
       floor_label = "landing cost"
   ```
   - Dynamic error detail: `f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{c_floor:.2f}."`

#### `apps/backend/apps/billing/sale_services.py`
1. **Service Verification (`sale_services.py` lines 364–386):**
   ```python
   if sale_invoice.sale_type == 'WHOLESALE':
       if batch.purchase_rate and batch.purchase_rate > Decimal('0'):
           c_floor = batch.purchase_rate
       elif batch.pts and batch.pts > Decimal('0'):
           c_floor = batch.pts
       else:
           c_floor = batch.landing_rate or batch.ptr or Decimal('0')
       floor_label = "purchase rate"
   else:
       if batch.landing_rate and batch.landing_rate > Decimal('0'):
           c_floor = batch.landing_rate
       elif batch.ptr and batch.ptr > Decimal('0'):
           c_floor = batch.ptr
       else:
           c_floor = batch.purchase_rate or Decimal('0')
       floor_label = "landing cost"

   if c_floor > Decimal('0') and pricing_result['net_rate'] < (c_floor - Decimal('0.005')):
       transaction.set_rollback(True)
       prod_name = product.name if product else batch.batch_no
       raise ValidationError(f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{c_floor:.2f}.")
   ```

---

## 4. Test Verification & Results

### 4.1 Frontend Test Suite (`jest tests/unit/`)
```
PASS tests/unit/inferPackUnit.test.ts
PASS tests/unit/billingMarginUtils.test.ts
PASS tests/unit/PurchaseGridUX.test.tsx
PASS tests/unit/PaymentBreakdownCell.test.tsx
PASS tests/unit/LossSaleLock.test.tsx
PASS tests/unit/SortDropdown.test.tsx
PASS tests/unit/MarginVisibility.test.tsx

Test Suites: 7 passed, 7 total
Tests:       71 passed, 71 total
Snapshots:   0 total
```
Key tests added & verified:
- `billingMarginUtils.test.ts`:
  - `WHOLESALE mode prioritizes purchaseRate > pts > landingRate > ptr` (Passed)
  - `RETAIL mode prioritizes landingRate > ptr > purchaseRate` (Passed)
  - `passes saleType to calculateLineMargin correctly in WHOLESALE mode` (Passed)
- `LossSaleLock.test.tsx`:
  - `uses landing_rate (85) in RETAIL mode, flagging rate 70 as a loss sale` (Passed)
  - `uses purchase_rate (60) in WHOLESALE mode, allowing rate 70 with positive profit` (Passed)
  - `shows below purchase rate warning banner in WHOLESALE mode when sold below purchase rate` (Passed)

### 4.2 Backend Test Suite (`pytest apps/billing/tests/test_billing_api.py`)
```
apps/billing/tests/test_billing_api.py::test_sale_create_api PASSED      [ 14%]
apps/billing/tests/test_billing_api.py::test_sale_create_invalid_payload PASSED [ 28%]
apps/billing/tests/test_billing_api.py::test_sale_create_prevents_loss_sale_below_ptr PASSED [ 42%]
apps/billing/tests/test_billing_api.py::test_sale_create_prevents_loss_sale_via_bill_discount PASSED [ 57%]
apps/billing/tests/test_billing_api.py::test_sale_create_uses_landing_rate_strictly PASSED [ 71%]
apps/billing/tests/test_billing_api.py::test_sale_create_wholesale_allows_sale_above_purchase_rate_even_if_below_landing PASSED [ 85%]
apps/billing/tests/test_billing_api.py::test_sale_create_wholesale_prevents_loss_sale_below_purchase_rate PASSED [100%]

============================== 7 passed in 33.47s ==============================
```
Key tests added & verified:
- **`test_sale_create_wholesale_allows_sale_above_purchase_rate_even_if_below_landing`**: Verified that in Wholesale mode, selling at ₹70 (above `purchase_rate` ₹60, but below `landing_rate` ₹85) is permitted and returns `201 Created`.
- **`test_sale_create_wholesale_prevents_loss_sale_below_purchase_rate`**: Verified that selling below ₹60 in Wholesale mode is blocked with `400 Bad Request` and detail string containing `"below its purchase rate of ₹60.00"`.
- **`test_sale_create_uses_landing_rate_strictly`**: Verified that selling below `landing_rate` ₹85 in Retail mode is blocked with `400 Bad Request` and detail string containing `"below its landing cost of ₹85.00"`.

---

## 5. Artifact & File Change Matrix

| File Path | Component / Layer | Primary Change |
|---|---|---|
| `apps/frontend/lib/billingMarginUtils.ts` | Frontend Math Engine | Added `saleType` parameter; branched `costFloor` priority |
| `apps/frontend/lib/cartUtils.ts` | Frontend Cart Math | Branched `rawCost` priority based on `saleType` |
| `apps/frontend/components/billing/MainInvoiceWorkspace.tsx` | Frontend Workspace UI | Injected `saleType`; dynamic `Below Purchase Rate` / `Below Landing Cost` badge |
| `apps/frontend/components/billing/RightBillingRail.tsx` | Frontend Billing Rail UI | Injected `saleType` into `calculateTotalMargin`; dynamic lock banner |
| `apps/frontend/hooks/useCheckout.ts` | Frontend Checkout Hook | Injected `saleType` into line & bill loss prevention checks |
| `apps/backend/apps/billing/views.py` | Backend API (`SaleCreateView`) | Branched pre-check & in-transaction `cost_floor` / `c_floor` & dynamic `floor_label` |
| `apps/backend/apps/billing/sale_services.py` | Backend Domain Service | Branched `c_floor` & dynamic `floor_label` in `create_sale_invoice_transaction` |
| `apps/frontend/tests/unit/billingMarginUtils.test.ts` | Unit Tests | Added Wholesale vs. Retail priority test cases |
| `apps/frontend/tests/unit/LossSaleLock.test.tsx` | Unit / Component Tests | Added Wholesale lock & banner test cases |
| `apps/backend/apps/billing/tests/test_billing_api.py` | Integration Tests | Added Wholesale 201 pass and 400 rejection tests |

---

## 6. Conclusion

Phase 2 Dual-Mode Margin Floor execution is complete, thoroughly tested, and ready for deployment. Wholesale transactions can now be booked based on base `purchase_rate` without false positives from landed expenses, while Retail transactions remain protected by full `landing_rate` floors.
