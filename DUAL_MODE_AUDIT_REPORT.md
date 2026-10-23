# DUAL-MODE MARGIN AUDIT REPORT (READ-ONLY)

**Status:** Audit Completed (Read-Only)  
**Date:** 2026-10-23  
**Scope:** Retail vs. Wholesale Margin Floor Data Flow (`landing_rate` vs. `purchase_rate`)

---

## EXECUTIVE SUMMARY

This audit analyzes the propagation of the `saleType` transaction mode across the MediFlow POS stack.
- **Business Rule:** 
  - **Retail Mode:** The selling price floor is governed by `landing_rate` (cost including GST, freight, and other inward expenses).
  - **Wholesale Mode:** The selling price floor is governed by `purchase_rate` (base purchase cost / PTS), allowing B2B transactions without retail landing markups.
- **Audit Findings:** 
  - The UI and store already maintain `activeDraft.saleType` (`'RETAIL' | 'WHOLESALE'`) and send it in the checkout payload as `"saleType"`.
  - However, the frontend math engine (`billingMarginUtils.ts`) and backend API checks (`views.py` & `sale_services.py`) currently prioritize `landing_rate` globally regardless of whether `saleType` is `RETAIL` or `WHOLESALE`.
  - Neither `calculateLineMargin` nor `calculateTotalMargin` in `billingMarginUtils.ts` currently accept or propagate `saleType`.

---

## 1. FRONTEND DATA FLOW & TARGET MAP

### 1.1 State & UI Toggle
1. **UI Switch Component:** [BillingHeaderStrip.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/BillingHeaderStrip.tsx#L66-L87)
   - Renders the Retail / Wholesale toggle buttons.
   - Calls `setSaleType(activeDraftId, 'RETAIL')` or `setSaleType(activeDraftId, 'WHOLESALE')`.
2. **State Storage:** [billingStore.ts](file:///home/asta/coding/MDF/apps/frontend/store/billingStore.ts#L48-L255)
   - Stored in the active draft object under: `draft.saleType: 'RETAIL' | 'WHOLESALE'`.
   - Default value: `'RETAIL'`.
   - Accessed in UI components as `activeDraft.saleType`.
   - *(Note: `documentMode` represents `'invoice' | 'quotation'` and is orthogonal to `'RETAIL' | 'WHOLESALE'`)*.
3. **Checkout Payload Construction:** [payloadBuilders.ts](file:///home/asta/coding/MDF/apps/frontend/utils/payloadBuilders.ts#L82)
   - Packages `saleType: draft.saleType || 'RETAIL'` into the sale create request payload.

### 1.2 Math Engine Integration Gaps
1. **`calculateLineMargin` Function Signature:** [billingMarginUtils.ts](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts#L32)
   - **Current Signature:**
     ```typescript
     export function calculateLineMargin(item: CartItem, extraDiscountPct: number = 0): LineMarginInfo
     ```
   - **Missing Parameter:** Does **not** accept `saleType`.
   - **Current Floor Assignment (Lines 50–56):**
     ```typescript
     const costFloor = (!isNaN(rawLanding) && rawLanding > 0)
         ? rawLanding
         : ((!isNaN(rawPtr) && rawPtr > 0)
             ? rawPtr
             : ...
     ```
     *Always checks `landingRate` first, even in Wholesale mode.*

2. **`calculateTotalMargin` Function Signature:** [billingMarginUtils.ts](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts#L108-L113)
   - **Current Signature:**
     ```typescript
     export function calculateTotalMargin(
         cart: CartItem[],
         billRevenue?: number,
         billDiscountAmount: number = 0,
         extraDiscountPct: number = 0
     ): TotalMarginInfo
     ```
   - **Missing Parameter:** Does **not** accept `saleType` and calls `calculateLineMargin(item, extraDiscountPct)` at line 134 without mode context.

3. **Call Sites Needing `saleType` Injection:**
   - [MainInvoiceWorkspace.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/MainInvoiceWorkspace.tsx#L126): `calculateTotalMargin(..., activeDraft.saleType)`
   - [MainInvoiceWorkspace.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/MainInvoiceWorkspace.tsx#L795): `calculateLineMargin(item, extraDiscPct, saleType)`
   - [MainInvoiceWorkspace.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/MainInvoiceWorkspace.tsx#L939-L948): UI badge text currently hardcoded to `"Below Landing Cost"`. Needs conditional string `"Below Purchase Rate"` in Wholesale mode.
   - [RightBillingRail.tsx](file:///home/asta/coding/MDF/apps/frontend/components/billing/RightBillingRail.tsx#L85): `calculateTotalMargin(..., activeDraft.extraDiscountPct, activeDraft.saleType)`
   - [useCheckout.ts](file:///home/asta/coding/MDF/apps/frontend/hooks/useCheckout.ts#L67-L68): Both `calculateTotalMargin` and `calculateLineMargin` called without `saleType`.
   - [cartUtils.ts](file:///home/asta/coding/MDF/apps/frontend/lib/cartUtils.ts#L66-L75): `calculateRowTotals` already receives `saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'`, but line 69 currently checks `rawLanding` before evaluating `saleType === 'WHOLESALE'`.

---

## 2. BACKEND PAYLOAD & TARGET MAP

### 2.1 API Endpoint & Payload Key Confirmation
- **Primary Endpoint:** `POST /api/v1/sales/` handled by `SaleCreateView` in [views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L625).
- **Exact JSON Key Used:**
  ```python
  request.data.get('saleType', 'RETAIL')
  ```
  Confirmed in:
  - [views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L635): `req_sale_type = request.data.get('saleType', 'RETAIL')`
  - [views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L827): `sale_type = request.data.get('saleType', 'RETAIL')`
  - [sale_services.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/sale_services.py#L160): `sale_type = request_data.get('saleType', 'RETAIL').upper()`

### 2.2 Security Lock Blocks & Line Numbers
1. **`SaleCreateView` Pre-Transaction Early Validation Block:**
   - **Location:** [apps/backend/apps/billing/views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L645-L652)
   - **Current Implementation:**
     ```python
     645: if batch_obj.landing_rate and batch_obj.landing_rate > Decimal('0'):
     646:     cost_floor = batch_obj.landing_rate
     647: elif req_sale_type == 'WHOLESALE' and batch_obj.pts and batch_obj.pts > Decimal('0'):
     648:     cost_floor = batch_obj.pts
     649: elif batch_obj.ptr and batch_obj.ptr > Decimal('0'):
     650:     cost_floor = batch_obj.ptr
     651: else:
     652:     cost_floor = batch_obj.purchase_rate or Decimal('0')
     ```
   - **Rejection Message (Line 680):**
     `"detail": f"Loss Sale Prevented: Cannot sell {prod_name} below its landing cost of ₹{cost_floor:.2f}."`

2. **`SaleCreateView` Atomic In-Transaction Validation Block:**
   - **Location:** [apps/backend/apps/billing/views.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py#L969-L976)
   - **Current Implementation:**
     ```python
     969: if batch.landing_rate and batch.landing_rate > Decimal('0'):
     970:     c_floor = batch.landing_rate
     971: elif sale_type == 'WHOLESALE' and batch.pts and batch.pts > Decimal('0'):
     972:     c_floor = batch.pts
     973: elif batch.ptr and batch.ptr > Decimal('0'):
     974:     c_floor = batch.ptr
     975: else:
     976:     c_floor = batch.purchase_rate or Decimal('0')
     ```
   - **Rejection Block (Lines 988–997):**
     ```python
     988: if c_floor > Decimal('0') and net_unit_price < (c_floor - Decimal('0.005')):
     989:     transaction.set_rollback(True)
     990:     prod_name = product.name if product else batch.batch_no
     991:     return Response({
     992:         "detail": f"Loss Sale Prevented: Cannot sell {prod_name} below its landing cost of ₹{c_floor:.2f}.",
     ...
     ```

3. **`sale_services.py` Atomic Service Block:**
   - **Location:** [apps/backend/apps/billing/sale_services.py](file:///home/asta/coding/MDF/apps/backend/apps/billing/sale_services.py#L364-L375)
   - Same `c_floor` ladder and `ValidationError` string.

---

## 3. EXECUTION BLUEPRINT FOR PHASE 2

### Frontend Changes
1. **Update `calculateLineMargin`:**
   ```typescript
   export function calculateLineMargin(
       item: CartItem, 
       extraDiscountPct: number = 0,
       saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
   ): LineMarginInfo
   ```
   - **Wholesale Mode (`saleType === 'WHOLESALE'`):**
     `costFloor = (rawPurchase > 0 ? rawPurchase : (rawPts > 0 ? rawPts : (rawLanding > 0 ? rawLanding : rawPtr)))`
   - **Retail Mode (`saleType === 'RETAIL'`):**
     `costFloor = (rawLanding > 0 ? rawLanding : (rawPtr > 0 ? rawPtr : rawPurchase))`
2. **Update `calculateTotalMargin`:**
   - Accept `saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'` and pass it to each `calculateLineMargin(item, extraDiscountPct, saleType)`.
3. **Update Call Sites:**
   - In `MainInvoiceWorkspace.tsx`, `RightBillingRail.tsx`, and `useCheckout.ts`, pass `activeDraft.saleType || 'RETAIL'`.
   - In `MainInvoiceWorkspace.tsx`, conditionally label the row error badge:
     `saleType === 'WHOLESALE' ? Below Purchase Rate : Below Landing Cost`.
4. **Update `cartUtils.ts`:**
   - In `calculateRowTotals`, branch `rawCost` based on `saleType === 'WHOLESALE'`.

### Backend Changes
1. **Branch `cost_floor` / `c_floor` based on `sale_type`:**
   ```python
   if sale_type == 'WHOLESALE':
       # Wholesale mode: Cost floor is strictly purchase_rate (fallback to pts / landing_rate)
       if batch.purchase_rate and batch.purchase_rate > Decimal('0'):
           c_floor = batch.purchase_rate
       elif batch.pts and batch.pts > Decimal('0'):
           c_floor = batch.pts
       else:
           c_floor = batch.landing_rate or batch.ptr or Decimal('0')
       floor_label = "purchase rate"
   else:
       # Retail mode: Cost floor is strictly landing_rate (fallback to ptr / purchase_rate)
       if batch.landing_rate and batch.landing_rate > Decimal('0'):
           c_floor = batch.landing_rate
       elif batch.ptr and batch.ptr > Decimal('0'):
           c_floor = batch.ptr
       else:
           c_floor = batch.purchase_rate or Decimal('0')
       floor_label = "landing cost"
   ```
2. **Update Error Message:**
   `f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{c_floor:.2f}."`
   Apply to `SaleCreateView` (pre-check & in-transaction check) and `sale_services.py`.
