# MARGIN EDGE CASE MITIGATION REPORT

**Date:** 2026-10-24  
**Scope:** `apps/frontend/lib/billingMarginUtils.ts` · `apps/frontend/tests/unit/billingMarginUtils.test.ts`  
**Status:** ✅ ALL MITIGATIONS IMPLEMENTED — 20/20 Frontend Tests Passing

---

## Overview

Following the Smart Cap Desync fix, four mathematical boundary conditions were identified
that could still produce silent accounting errors or false-positive checkout locks in specific
bill configurations. This mission proactively patches all four.

---

## EC-1: 100% Free Promotional Item — Scheme Safe Harbor

### Problem
When a bill contains a purely promotional line (e.g., a 10+2 scheme's "+2" row with
`qtyStrips = 0, freeQtyStrips = 2`), `calculateLineMargin` received:

```
effectivePackQty = 0   (no billed strips)
baseSellingAmount = 0
sellingPricePerPack = 0
```

The `isLossSale` check:
```ts
// OLD — falsely fires on promo items!
const isLossSale = costFloor > 0 && effectivePackQty > 0 && (sellingPricePerPack < costFloor)
```

Although `effectivePackQty > 0` already guards this in the combined expression, the
early-return path was missing, causing downstream code to compute `lineCostFloorInclusive`
against a zero qty and potentially short-circuit at wrong values when called from
`calculateTotalMargin`.

### Fix — Early Return in `calculateLineMargin`

```ts
// NEW — explicit safe harbor guard
const billedQty = effectivePackQty;
const freeQtyStrips = Number((item as any).freeQtyStrips || 0);
if (billedQty <= 0 && freeQtyStrips > 0) {
    return { ..., isLossSale: false };  // Safe Harbor: promotional gift, not a loss sale
}
```

**Result:** Pure promo gift lines short-circuit immediately, return zero amounts and
`isLossSale: false`. No further calculation needed and no false lock.

---

## EC-2: Impossible Discount — Max Discount Ceiling

### Problem
If a cashier entered a flat bill discount exceeding the total cart's available profit
headroom (e.g., ₹500 discount on a cart with only ₹100 headroom), the old code simply
computed:

```ts
const totalDistributable = Math.min(targetBillDiscount, totalHeadroom);
```

While `Math.min` protected the distribution math, there was **no mechanism for the UI to
know the maximum safe discount** before sending it to the API. The API then rejected the
bill with a cryptic `LOSS_SALE_PREVENTED` error.

### Fix — `getMaxAllowableBillDiscount` Helper

A new exported helper computes the exact ceiling upfront:

```ts
export function getMaxAllowableBillDiscount(cart, saleType):
    { maxDiscountAmount: number; totalBaseAmount: number; maxDiscountPct: number }
```

**Formula:** `MAX_DISC = Σ max(0, lineBaseAmount − lineCostFloorInclusive)`

**Usage in UI:** Bind the extra discount input's `max` attribute or show a warning badge
when `enteredDiscount > maxDiscountAmount`.

**In `distributeSmartDiscounts`:** The `Math.min(targetBillDiscount, totalHeadroom)` cap
is now explicitly documented with a comment explaining that any excess is intentionally
truncated (so the UI must enforce the ceiling before reaching this point).

---

## EC-3: Apples-to-Apples Tax Alignment (Already Correct, Verified)

The prior Smart Cap fix already established:

| Variable | Tax State | Source |
|---|---|---|
| `lineCostFloorInclusive` | Tax-inclusive (× taxMultiplier) | Backend PTR/landing |
| `baseSellingAmount` (Retail) | Tax-inclusive (MRP-based) | `item.totalAmount` |
| `baseSellingAmount` (Wholesale) | Tax-exclusive + tax added | `rate × qty × taxMultiplier` |

Both sides of the `baseSellingAmount >= lineCostFloorInclusive` comparison are in the
same tax state. The atomic backend check likewise isolates `taxable_value` (exclusive)
against `c_floor × eff_qty` (exclusive). **No change needed.**

---

## EC-4: GST Calculation Sequencing — Post-Cap Tax

### Problem
If the Smart Cap fires and raises `finalRowAmount` from a discounted value (e.g., ₹104)
back to the cost floor (e.g., ₹118), the `finalTaxable` amount **must** be derived from
the post-cap `finalRowAmount`, not from the pre-cap intermediate value.

### Verification

In `distributeSmartDiscounts`, the final allocation block:

```ts
// Step 1: Cap finalRowAmount at cost floor (Smart Cap)
const finalRowAmount = Math.max(0, meta.baseAmount - meta.discount);
// isCapped check...

// Step 2: Derive taxable AFTER cap — correct sequencing guaranteed
const finalTaxable = Math.round((finalRowAmount / meta.taxMultiplier) * 100) / 100;
```

**GST = finalRowAmount − finalTaxable** → derived from post-cap amount ✅

A comment was added to `calculateLineMargin` explicitly documenting this contract:
```ts
// IMPORTANT: GST (CGST/SGST) is derived STRICTLY AFTER this cap step using the
// post-cap finalRowAmount, ensuring tax is never calculated on a discounted-below-floor amount.
```

---

## Test Coverage

| Test | What it Proves |
|---|---|
| `[EC-1]` 100% free promo item not flagged | `calculateLineMargin` safe harbor for `qty=0, freeQtyStrips>0` |
| `[EC-2]` `getMaxAllowableBillDiscount` ceiling | Correct headroom = Σ(base − floor) across mixed-margin cart |
| `[EC-3]` Impossible discount capped | `distributeSmartDiscounts` at 50% on item with 5% headroom → `discountAmount ≤ 5`, never loss |
| `[EC-4]` GST sequencing post-cap | Cap fires on 18% GST item (₹130→₹118), `finalTaxable ≈ ₹100`, `GST ≈ ₹18` |

**Suite result: 20/20 unit tests passing ✅** (from 16 previously)

---

## Files Modified

| File | Change |
|---|---|
| [`billingMarginUtils.ts`](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts) | Added `getMaxAllowableBillDiscount`, EC-1 safe harbor early return, EC-4 post-cap GST comment, EC-3 ceiling comment |
| [`billingMarginUtils.test.ts`](file:///home/asta/coding/MDF/apps/frontend/tests/unit/billingMarginUtils.test.ts) | Added 4 new proactive edge case tests (EC-1 through EC-4) |

---

## Recommended Next Steps (UI Enforcement)

To complete the Max Discount Ceiling loop, the extra discount input field should be
wired to `getMaxAllowableBillDiscount`:

```tsx
import { getMaxAllowableBillDiscount } from '@/lib/billingMarginUtils';

const { maxDiscountAmount, maxDiscountPct } = getMaxAllowableBillDiscount(cart, saleType);

<Input
  type="number"
  max={maxDiscountAmount}
  onChange={(val) => {
    if (val > maxDiscountAmount) {
      showToast(`Max allowable discount is ₹${maxDiscountAmount.toFixed(2)}`);
      return;
    }
    setExtraDiscount(val);
  }}
/>
```

This completes the full defence-in-depth chain:
**UI ceiling → Smart Distributor cap → Backend pre-check → Atomic transaction lock**
