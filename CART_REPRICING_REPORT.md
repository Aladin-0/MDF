# DRAFT MIGRATION & DYNAMIC CART REPRICING REPORT

**Execution Date:** 2026-10-23  
**Status:** Completed & Verified  
**Branch:** `feat/gst-2.0-updates`  
**Engineer:** Principal Frontend State Architect  

---

## 1. Problem & Context

When switching an active draft bill's `saleType` between **Retail** and **Wholesale** modes, previous behavior correctly switched the margin cost floors, but the items already loaded in the cart retained their static default selling rates (e.g., sticking to MRP even when switched to Wholesale). This forced cashiers and billing staff to manually reprice every row or re-enter the cart items from scratch.

---

## 2. Store Execution: `setSaleType` in `billingStore.ts`

The `setSaleType` action in `apps/frontend/store/billingStore.ts` was refactored to intercept the state update, automatically iterate over all existing items in `draft.cart`, apply the target mode's pricing policy, and recalculate row math using `calculateRowTotals`.

### The Store Update

```typescript
    setSaleType: (id, type) => set((state) => {
        const draft = state.drafts[id];
        if (!draft) return state;

        const updatedCart = (draft.cart || []).map((item) => {
            // 1. Swap the base rate
            let newRate = item.rate;
            if (type === 'WHOLESALE') {
                newRate = (item.pts && item.pts > 0) ? item.pts : (item.ptr || item.mrp || 0);
            } else {
                newRate = item.mrp || 0;
            }

            // 2. Recalculate row math with the new rate
            const updatedItem: CartItem = { ...item, rate: newRate, saleRate: newRate };
            const rowMath = calculateRowTotals(updatedItem, draft.extraDiscountPct || 0, type);

            return {
                ...updatedItem,
                ...rowMath,
                totalAmount: rowMath.totalAmount ?? rowMath.sellAmount,
                rate: rowMath.rate ?? newRate,
            };
        });

        return {
            drafts: {
                ...state.drafts,
                [id]: {
                    ...draft,
                    saleType: type,
                    billingBasis: type === 'WHOLESALE' ? 'PTR' : (draft.billingBasis === 'PTR' ? 'MRP' : draft.billingBasis),
                    cart: updatedCart,
                    updatedAt: new Date().toISOString()
                }
            }
        };
    }),
```

---

## 3. Math Engine Integration (`cartUtils.ts`)

To support clean row recalculations without duplicating tax and discount math, `calculateRowTotals` in `apps/frontend/lib/cartUtils.ts` was enhanced with a `CartItem` overload and `totalAmount` property on `RowTotals`:

```typescript
export function calculateRowTotals(
    item: CartItem,
    extraDiscountPct?: number,
    saleType?: 'RETAIL' | 'WHOLESALE'
): RowTotals;

export function calculateRowTotals(
    currentBatch: Batch,
    qtyStripsRaw: string,
    qtyLooseRaw: string,
    discountType: 'percentage' | 'amount',
    discountValueRaw: string,
    gstRate: number,
    historicalBaseRate?: number,
    saleType?: 'RETAIL' | 'WHOLESALE'
): RowTotals;
```

When called with `(updatedItem, draft.extraDiscountPct, type)`:
1. **Quantity Extraction:** Resolves `qtyStrips` and `qtyLoose` into fractional and loose units.
2. **Discount Preservation:** Carries forward any item-level percentage or fixed discount, applying it against the new base rate (`newRate`).
3. **Tax Treatment:**
   - **Wholesale (Tax-Exclusive):** `taxableAmount = rate * tQtyFractional; gstAmount = taxableAmount * (gstRate / 100); totalAmount = taxableAmount + gstAmount;`
   - **Retail (Tax-Inclusive):** `sellAmount = rate * tQtyFractional; taxableAmount = sellAmount / (1 + gstRate / 100); gstAmount = sellAmount - taxableAmount; totalAmount = sellAmount;`
4. **Bankers Rounding:** Ensures exact currency rounding on all resulting row metrics.

---

## 4. Verification & Test Coverage

A dedicated test suite `apps/frontend/tests/unit/CartRepricing.test.ts` was added to verify all dynamic rate migrations:

```
PASS tests/unit/CartRepricing.test.ts
  Cart Repricing on setSaleType Toggle
    ✓ swaps item rate to PTS (65) and recalculates totalAmount when toggling to WHOLESALE (4 ms)
    ✓ swaps item rate back to MRP (100) and recalculates totalAmount when toggling back to RETAIL (1 ms)
    ✓ falls back to PTR when PTS is 0 or missing in WHOLESALE mode (1 ms)
    ✓ preserves item discountPct and applies it to new wholesale base rate
```

Full frontend test suite passes:
```
Test Suites: 8 passed, 8 total
Tests:       75 passed, 75 total
```

Backend integration tests pass:
```
============================== 7 passed in 29.54s ==============================
```

---

## 5. Summary of Modified Files

| File | Changes Made |
|---|---|
| `apps/frontend/store/billingStore.ts` | Imported `calculateRowTotals`; updated `setSaleType` to iterate cart, swap base rates (`PTS` / `PTR` vs `MRP`), recalculate row math, and update `draft.cart`. |
| `apps/frontend/lib/cartUtils.ts` | Added `CartItem` overload for `calculateRowTotals`; added `totalAmount` to `RowTotals` return object. |
| `apps/frontend/tests/unit/CartRepricing.test.ts` | Added comprehensive unit tests for `setSaleType` toggling back and forth, fallback handling, and discount preservation. |
