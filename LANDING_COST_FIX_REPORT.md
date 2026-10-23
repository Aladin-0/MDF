# LANDING COST FIX REPORT: LOSS-SALE PREVENTION VARIABLE CORRECTION

**Status:** Completed & Verified  
**Date:** 2026-10-23  
**Target Systems:** POS Billing Engine (`apps/frontend/lib/billingMarginUtils.ts`, `apps/frontend/lib/cartUtils.ts`, `apps/frontend/components/billing/MainInvoiceWorkspace.tsx`) & Backend Sales Checkout API (`apps/backend/apps/billing/views.py`, `apps/backend/apps/billing/sale_services.py`)

---

## EXECUTIVE SUMMARY
The loss-sale prevention lock previously evaluated sales against the item's Price to Retailer (`PTR`) rather than its true landing cost. The database `Batch` model already stores the static field `landing_rate = models.DecimalField(...)`.

The variable swap was executed across the full stack:
1. **Frontend Math Engine & UI:** Replaced `ptr` comparison with `landingRate`, with graceful fallback to `ptr` / `pts` / `purchaseRate` if `landingRate` is null or zero. Updated the error badge from `Below PTR (₹{item.ptr})` to `Below Landing Cost (₹{item.landingRate})`.
2. **Backend Security Lock:** Updated both the pre-check and atomic transaction validation in `SaleCreateView` (and `sale_services.py`) to strictly evaluate net rates against `batch.landing_rate`, with graceful null-fallback handling. Updated the rejection message to:  
   *"Loss Sale Prevented: Cannot sell [Item Name] below its landing cost of ₹[landing_rate]."*

---

## 1. FRONTEND FIX

### 1.1 Updated `isLossSale` Calculation Snippet (`apps/frontend/lib/billingMarginUtils.ts`)
```typescript
// Cost floor: Force type coercion. Strictly prioritize landingRate, fallback to ptr / pts / purchaseRate if null or 0.
const rawLanding = Number(item.landingRate ?? (item as any).landing_rate);
const rawPtr = Number(item.ptr);
const rawPts = Number(item.pts);
const rawPurchase = Number(item.purchaseRate ?? (item as any).purchase_rate);

const costFloor = (!isNaN(rawLanding) && rawLanding > 0)
    ? rawLanding
    : ((!isNaN(rawPtr) && rawPtr > 0)
        ? rawPtr
        : ((!isNaN(rawPts) && rawPts > 0)
            ? rawPts
            : ((!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase : 0)));

const landingRate = (!isNaN(rawLanding) && rawLanding > 0)
    ? rawLanding
    : costFloor;

const lineLandingCost = Math.round(costFloor * effectivePackQty * 100) / 100;

// Base selling amount for this line (after item-level discount)
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

// Apply extra discount % (bill-level) proportionally
const discountFactor = extraDiscountPct > 0 ? (1 - extraDiscountPct / 100) : 1;
const finalRowAmount = Math.round(baseSellingAmount * discountFactor * 100) / 100;

// Unified formula: (Final Row Amount / Quantity)
const sellingPricePerPack = effectivePackQty > 0 ? (finalRowAmount / effectivePackQty) : Number(item.rate || item.saleRate || 0);
const margin = Math.round((sellingPricePerPack - costFloor) * 100) / 100;
const marginPct = sellingPricePerPack > 0 ? Math.round((margin / sellingPricePerPack) * 10000) / 100 : 0;
const lineGrossProfit = Math.round((finalRowAmount - lineLandingCost) * 100) / 100;

// Loss-Sale: Strictly flag ONLY when mathematically proven unit net rate is less than unit landing cost / cost floor
const isLossSale = costFloor > 0 && effectivePackQty > 0 && (sellingPricePerPack < (costFloor - 0.005));
```

### 1.2 Grid UI Text & Badge Update (`apps/frontend/components/billing/MainInvoiceWorkspace.tsx`)
```tsx
<td 
    className={cn(
        "px-3 py-1.5 text-[13px] font-black text-right transition-colors",
        lineMargin.isLossSale 
            ? "bg-red-50 text-red-600 border border-red-200" 
            : "text-slate-800"
    )}
    title={lineMargin.isLossSale ? `Rate is below Landing Cost (₹${(item.landingRate ?? lineMargin.costFloor).toFixed(2)})` : undefined}
>
    <div className="flex flex-col items-end">
        <span>₹{item.totalAmount.toFixed(2)}</span>
        {lineMargin.isLossSale && (
            <span 
                className="text-[9px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded flex items-center gap-0.5 mt-0.5"
                title={`Rate is below Landing Cost (₹${(item.landingRate ?? lineMargin.costFloor).toFixed(2)})`}
            >
                Below Landing Cost (₹{(item.landingRate ?? lineMargin.costFloor).toFixed(2)})
            </span>
        )}
    </div>
</td>
```

---

## 2. BACKEND SECURITY LOCK FIX

### 2.1 Updated Python Validation Snippet (`apps/backend/apps/billing/views.py`)
```python
# Strictly evaluate against batch.landing_rate, falling back to ptr / pts / purchase_rate if null or 0
if batch.landing_rate and batch.landing_rate > Decimal('0'):
    c_floor = batch.landing_rate
elif sale_type == 'WHOLESALE' and batch.pts and batch.pts > Decimal('0'):
    c_floor = batch.pts
elif batch.ptr and batch.ptr > Decimal('0'):
    c_floor = batch.ptr
else:
    c_floor = batch.purchase_rate or Decimal('0')

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
        "detail": f"Loss Sale Prevented: Cannot sell {prod_name} below its landing cost of ₹{c_floor:.2f}.",
        "code": "LOSS_SALE_PREVENTED",
        "batchId": str(batch.id),
        "cost_floor": float(c_floor),
        "net_rate": float(net_unit_price.quantize(Decimal('0.01')))
    }, status=status.HTTP_400_BAD_REQUEST)
```

---

## 3. VERIFICATION

1. **Frontend Tests:**
   - Ran `npm test -- tests/unit/`
   - **7/7 test suites passed, 63/63 tests passed.**
   - Includes tests verifying that when `landingRate` is set (e.g., ₹85), a sale at ₹75 (above PTR ₹70 but below landing cost ₹85) is strictly identified and blocked as a loss sale.
   - Includes tests verifying graceful fallback to `ptr` if `landingRate` is missing or 0.

2. **Backend Tests:**
   - Ran `docker exec mediflow_backend pytest apps/billing/tests/test_billing_api.py`
   - **5/5 tests passed in 27.67s**, including:
     - `test_sale_create_prevents_loss_sale_below_ptr`: PASSED (verified fallback message `"below its landing cost of ₹80.00"`)
     - `test_sale_create_prevents_loss_sale_via_bill_discount`: PASSED
     - `test_sale_create_uses_landing_rate_strictly`: PASSED (verified explicit priority of `batch.landing_rate = 85.00` blocking a sale rate of 78.00 despite PTR being 70.00)
