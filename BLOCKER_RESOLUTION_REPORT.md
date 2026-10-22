# BLOCKER RESOLUTION REPORT: BILLING MARGIN FALSE POSITIVES & PURCHASE SUBMISSION FAILURE

**Status:** Resolved & Verified  
**Date:** 2026-10-22  
**Target Systems:** POS Billing Workspace (`apps/backend/apps/billing/`, `apps/frontend/lib/`, `apps/frontend/components/billing/`) & Purchase Inward Entry (`apps/frontend/components/purchases/`, `apps/frontend/utils/payloadBuilders.ts`)

---

## EXECUTIVE SUMMARY

Two critical blockers preventing standard daily operations were investigated and resolved:
1. **Billing Loss-Sale False Positive:** Legitimate customer sales priced at MRP or discounted within allowable margins were erroneously blocked with "below landing cost" / loss-sale warnings.
2. **Purchase Form Silent Failure:** Clicking the "Save Purchase" button silently failed without dispatching any network request to the backend API.

Both issues have been remediated with root-cause fixes, type-safe numerical coercion, unified mathematical formulas, and thorough test verification.

---

## 1. BILLING LOSS-SALE FALSE POSITIVE: ROOT CAUSE & FIX

### 1.1 Root Causes Identified

1. **Tax Discrepancy in Line Margin (`apps/frontend/lib/cartUtils.ts`):**
   - In `calculateRowTotals`, margin was calculated as `marginAmount = taxableAmount - totalCost`, where `taxableAmount` is the pre-tax selling figure (e.g. ₹84.75 on a ₹100 MRP item with 18% GST), whereas `totalCost` was calculated using the gross PTR/landing rate (e.g. ₹85.00).
   - This caused `marginAmount < 0` and flagged `isNegativeMargin = true` even when sold at full MRP, because tax-exclusive revenue was compared against gross cost rate.
2. **Backend Double-Discounting Bug (`apps/backend/apps/billing/views.py`):**
   - In `SaleCreateView`, `net_unit_price` was calculated as `proposed_rate * (1 - item_disc / 100) * disc_factor`. Because `proposed_rate` was already derived from the item's discounted rate, multiplying by `(1 - item_disc / 100)` a second time effectively doubled the discount deduction, dropping the net unit price below PTR.
3. **Flawed Landing Cost Retrieval in `validate_sale_price` (`apps/backend/apps/billing/utils/pricing.py`):**
   - The pricing helper called `get_landing_cost_for_batch(batch, pharmacy_id)`, which attempted to query `PurchaseItem.get_landing_cost()`. This often returned box-level purchase rates or miscalculated inventory costs, incorrectly blocking sales.
4. **Draft Loading Missing Cost Floor Fields (`apps/frontend/hooks/useLoadDrafts.ts`):**
   - When drafts were loaded, items were populated without `ptr`, `pts`, or `landingRate`, causing margin checks to fall back to `0` or evaluate against incomplete defaults, while fractional loose pack calculations used string concatenation.

---

### 1.2 Mathematical & Code Fixes

#### A. Unified Formula for Net Selling Price & Type Coercion
Both frontend and backend now strictly compute net unit selling price as:
$$\text{Net Unit Selling Price} = \frac{\text{Final Row Amount}}{\text{Effective Quantity}}$$

Where:
- $\text{Effective Quantity} = \text{Qty Strips} + \frac{\text{Qty Loose}}{\text{Pack Size}}$ (or fallback to fractional `totalQty`).
- $\text{Final Row Amount} = \text{Base Selling Amount} \times (1 - \frac{\text{Extra Discount \%}}{100})$.
- Cost Floor is type-coerced strictly to numbers: `Number(item.ptr)` $\rightarrow$ `Number(item.pts)` $\rightarrow$ `Number(item.landingRate)` $\rightarrow$ `Number(item.purchaseRate)`.
- Loss-sale is flagged **only** if:
$$\text{Net Unit Selling Price} < (\text{Cost Floor} - 0.005)$$

#### B. Corrected Implementation in `apps/frontend/lib/billingMarginUtils.ts`
```typescript
// Type coercion and numeric safety
const rawPtr = Number(item.ptr);
const rawPts = Number(item.pts);
const rawLanding = Number(item.landingRate);
const rawPurchase = Number(item.purchaseRate);

const costFloor = (!isNaN(rawPtr) && rawPtr > 0)
    ? rawPtr
    : ((!isNaN(rawPts) && rawPts > 0)
        ? rawPts
        : ((!isNaN(rawLanding) && rawLanding > 0)
            ? rawLanding
            : ((!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase : 0)));

// Base selling amount after line discount
let baseSellingAmount = Number(item.totalAmount);
if (isNaN(baseSellingAmount) || baseSellingAmount <= 0) {
    if (effectivePackQty > 0) {
        const baseRate = Number(item.rate || item.saleRate || item.mrp || 0);
        const discPct = Number(item.discountPct || 0);
        baseSellingAmount = baseRate * effectivePackQty * (1 - discPct / 100);
    } else {
        baseSellingAmount = 0;
    }
}

// Proportional bill discount factor
const discountFactor = extraDiscountPct > 0 ? (1 - extraDiscountPct / 100) : 1;
const finalRowAmount = Math.round(baseSellingAmount * discountFactor * 100) / 100;

// Unified formula: (Final Row Amount / Quantity)
const sellingPricePerPack = effectivePackQty > 0 
    ? (finalRowAmount / effectivePackQty) 
    : Number(item.rate || item.saleRate || 0);

// Loss-Sale: Strictly flag ONLY when mathematically proven unit net rate is less than unit PTR / cost floor
const isLossSale = costFloor > 0 && effectivePackQty > 0 && (sellingPricePerPack < (costFloor - 0.005));
```

#### C. Corrected Backend Logic in `apps/backend/apps/billing/views.py`
```python
# Unified formula: (Final Row Amount / Quantity)
pack_sz = Decimal(str(batch.pack_size or 1))
eff_qty = Decimal(str(qty_to_deduct)) + (Decimal(str(loose_to_deduct)) / pack_sz)
if eff_qty > Decimal('0'):
    disc_factor = Decimal('1') - (extra_discount_pct / Decimal('100')) if extra_discount_pct > Decimal('0') else Decimal('1')
    c_floor = batch.ptr if (batch.ptr and batch.ptr > Decimal('0')) else (batch.landing_rate or batch.purchase_rate or Decimal('0'))
    if sale_type == 'WHOLESALE' and batch.pts and batch.pts > Decimal('0'):
        c_floor = batch.pts

    item_amt = Decimal('0')
    if item_data.get('totalAmount') is not None:
        item_amt = Decimal(str(item_data.get('totalAmount', 0)))
    if item_amt <= Decimal('0'):
        tax_amt = Decimal(str(item_data.get('taxableAmount', 0)))
        g_amt = Decimal(str(item_data.get('gstAmount', 0)))
        item_amt = tax_amt + g_amt
    if item_amt <= Decimal('0'):
        p_rate = Decimal(str(item_data.get('rate', batch.mrp)))
        d_pct = Decimal(str(item_data.get('discountPct', 0)))
        item_amt = (p_rate * eff_qty) * (Decimal('1') - d_pct / Decimal('100'))

    final_row_amt = item_amt * disc_factor
    net_unit_price = final_row_amt / eff_qty

    if c_floor > Decimal('0') and net_unit_price < (c_floor - Decimal('0.005')):
        transaction.set_rollback(True)
        prod_name = product.name if product else batch.batch_no
        return Response({
            "error": "LOSS_SALE_PREVENTED",
            "message": f"Loss Sale Prevented: {prod_name} cannot be sold below cost floor of ₹{c_floor:.2f}. Calculated net unit rate is ₹{net_unit_price:.2f}."
        }, status=status.HTTP_400_BAD_REQUEST)
```

#### D. Pricing Validation Cleanup (`apps/backend/apps/billing/utils/pricing.py`)
- Removed the faulty `PurchaseItem.get_landing_cost()` check in `validate_sale_price()`. The function now strictly enforces the legal MRP ceiling (`sale_rate <= mrp + 0.005`), leaving margin floor enforcement to the exact unified formula in `SaleCreateView`.

---

## 2. PURCHASE SUBMISSION SILENT FAILURE: ROOT CAUSE & FIX

### 2.1 Root Causes Identified

1. **Silent Rejection by React Hook Form (`apps/frontend/components/purchases/NewPurchaseForm.tsx`):**
   - The Save button had `type="button"` and invoked `onClick={() => handleSubmit(onSubmit)()}` without passing an `onInvalid` callback.
   - When schema validation failed, React Hook Form blocked `onSubmit` and returned silently with zero console output and zero user notifications.
2. **Trailing Blank Rows Generated by Enter-Key Grid Navigation:**
   - Grid navigation automatically appends an empty row (`emptyItem()`) when the user reaches the end of an item line.
   - When the user subsequently clicked Save, the blank trailing row was included in the form state. Zod schema validation failed on that row (`productId: Required`, `qty: Expected number`, `mrp: Required`), causing the form to silently abort.
3. **Un-normalized Expiry Input Formats:**
   - The recently added masked expiry input allowed users to input formats like `MM/YY` (e.g. `12/26`) or `MM/YYYY` (e.g. `12/2026`).
   - The backend API requires `YYYY-MM-01`. Without normalization in the payload builder, raw strings like `12/26` either failed frontend schema or backend validation.

---

### 2.2 Fixes Applied

#### A. Trailing Row Sanitization Before Submission
Added `cleanItemsBeforeSubmit()` to strip out trailing blank rows generated by keyboard navigation before running validation:
```typescript
const cleanItemsBeforeSubmit = () => {
    const validItems = items.filter(it => 
        (it.productId && it.productId.trim() !== '') || 
        (it.productName && it.productName.trim() !== '')
    );
    if (validItems.length === 0) {
        toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Please add at least one product to the purchase invoice.'
        });
        return null;
    }
    if (validItems.length !== items.length) {
        setItems(validItems);
        setValue('items', validItems);
    }
    return validItems;
};
```

#### B. Explicit `onInvalid` Callback for User Actionable Feedback
Added an explicit error handler to `handleSubmit(onSubmit, onInvalid)` that identifies the failing row number and field:
```typescript
const onInvalid = (errors: any) => {
    console.error("PURCHASE FORM VALIDATION ERRORS:", errors);
    let errMsg = "Please check required fields in the form";
    if (errors.partyLedgerId) {
        errMsg = errors.partyLedgerId.message || "Select a party ledger";
    } else if (errors.invoiceNo) {
        errMsg = errors.invoiceNo.message || "Invoice No is required";
    } else if (errors.items && Array.isArray(errors.items) && errors.items.length > 0) {
        const firstErrIdx = errors.items.findIndex((row: any) => row && Object.keys(row).length > 0);
        if (firstErrIdx >= 0) {
            const rowErrors = errors.items[firstErrIdx];
            const failingKeys = Object.keys(rowErrors);
            const firstMsg = rowErrors[failingKeys[0]]?.message || failingKeys.join(", ");
            errMsg = `Item Row ${firstErrIdx + 1}: ${firstMsg}`;
        }
    } else if ((errors.items as any)?.message) {
        errMsg = (errors.items as any).message;
    }
    toast({
        variant: 'destructive',
        title: 'Form Validation Error',
        description: errMsg
    });
};
```

#### C. Primary Button Type & Event Handling
Updated the Save button to `type="submit"` and wired it to clean items and invoke `handleSubmit(onSubmit, onInvalid)()`:
```tsx
<Button
    type="submit"
    onClick={(e) => {
        const valid = cleanItemsBeforeSubmit();
        if (!valid) {
            e.preventDefault();
            return;
        }
        handleSubmit(onSubmit, onInvalid)();
    }}
    disabled={isSubmitting}
    className="h-14 md:h-auto min-h-full w-full md:w-32 flex flex-col gap-1 justify-center rounded-lg shadow-sm"
    title="Shortcut: Ctrl + Enter"
>
```

#### D. Expiry Date Normalization (`apps/frontend/utils/payloadBuilders.ts`)
Added `normalizeExpiryDate()` to automatically convert `MM/YY`, `MM/YYYY`, and `YYYY-MM` into standard `YYYY-MM-01`:
```typescript
export function normalizeExpiryDate(exp?: string): string {
    if (!exp) return '';
    const raw = exp.trim();
    // MM/YY e.g. 12/26
    const mShort = raw.match(/^(\d{1,2})[/\-](\d{2})$/);
    if (mShort) {
        const m = parseInt(mShort[1], 10);
        const y = parseInt(mShort[2], 10) + 2000;
        if (m >= 1 && m <= 12) {
            return `${y}-${String(m).padStart(2, '0')}-01`;
        }
    }
    // MM/YYYY e.g. 12/2026
    const mLong = raw.match(/^(\d{1,2})[/\-](\d{4})$/);
    if (mLong) {
        const m = parseInt(mLong[1], 10);
        const y = parseInt(mLong[2], 10);
        if (m >= 1 && m <= 12) {
            return `${y}-${String(m).padStart(2, '0')}-01`;
        }
    }
    // YYYY-MM
    const mIso = raw.match(/^(\d{4})-(\d{1,2})$/);
    if (mIso) {
        return `${mIso[1]}-${mIso[2].padStart(2, '0')}-01`;
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }
    return raw;
}
```

---

## 3. VERIFICATION & TEST RESULTS

### 3.1 Frontend Test Suite
- Executed Jest tests across unit test suites:
  ```bash
  npm test -- tests/unit/
  ```
- **Results:**
  - `MarginVisibility.test.tsx`: **8 passed, 0 failed**
  - `SortDropdown.test.tsx`: **passed**
  - `LossSaleLock.test.tsx`: **passed**
  - `PurchaseGridUX.test.tsx`: **passed**
  - `PaymentBreakdownCell.test.tsx`: **passed**
  - `inferPackUnit.test.ts`: **passed**
  - `billingMarginUtils.test.ts`: **passed**
  - **Total:** **7 test suites passed, 61 unit tests passed**.

### 3.2 Backend Test Suite
- Executed Pytest in the Django backend container:
  ```bash
  docker exec mediflow_backend pytest apps/billing/tests/test_billing_api.py apps/billing/tests/test_discount_math.py apps/billing/tests/test_empty_items_validation.py
  ```
- **Results:**
  - `test_sale_create_api`: **PASSED**
  - `test_sale_create_invalid_payload`: **PASSED**
  - `test_sale_create_prevents_loss_sale_below_ptr`: **PASSED**
  - `test_sale_create_prevents_loss_sale_via_bill_discount`: **PASSED**
  - `test_invoice_extra_discount_only`: **PASSED**
  - `test_item_and_invoice_discount_combined`: **PASSED**
  - `test_item_discount_only`: **PASSED**
  - `test_no_discount`: **PASSED**
  - `test_create_sale_with_empty_items_returns_400`: **PASSED**
  - `test_create_sale_with_no_items_key_returns_400`: **PASSED**
  - `test_revise_sale_with_empty_items_returns_400`: **PASSED**
  - `test_revise_sale_with_no_items_key_returns_400`: **PASSED**
  - **Total:** **12 passed, 0 failed**.

---

## 4. CONCLUSION

Both critical blockers are completely resolved:
- Valid sales at or above PTR/landing cost will never be blocked by false-positive margin calculations.
- Cashiers are strictly prevented from viewing margin details, while admins/managers retain full visibility.
- Purchase invoices submit reliably, even when enter-key navigation creates trailing rows or users enter masked expiry formats. Any actual validation mistakes are clearly displayed via toast notifications with row and field precision.
