# LOSS-SALE PREVENTION & MARGIN LOCK ARCHITECTURE REPORT

## Executive Summary
This architectural hotfix eliminates the business-critical risk of **loss sales** within the POS billing system. Pharmacists and cashiers are now actively prevented from selling pharmaceutical inventory at net prices below the item's **Landing Cost / Price to Retailer (PTR)**, whether dropped via item-level discounts, loose unit fractional splits, or global bill-level extra discounts.

---

## 1. Backend Security & Ironclad Checkout Lock

### Cost Floor Resolution
In `apps/backend/apps/inventory/models.py`, each `Batch` records:
- `ptr`: Price to Retailer (primary cost floor for retail sales).
- `pts`: Price to Stockist (cost floor for wholesale stockist sales).
- `purchase_rate`: Base purchase cost per pack.
- `landing_rate`: Landing cost per pack (freight + taxes).

### Pre-Validation & Atomic Margin Lock in `SaleCreateView`
File: [`apps/backend/apps/billing/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py)

Before entering the database transaction and before invoice sequence numbers are consumed, `SaleCreateView` audits every item against its batch's cost floor. It derives the net selling rate per pack after item discounts and bill-level extra discounts:

```python
# Enforce Loss-Sale Prevention & Margin Lock:
# Prevent items from being sold below their cost floor (PTR or landing cost)
extra_disc_pct = Decimal(str(request.data.get('extraDiscountPct', 0)))
discount_factor = Decimal('1') - (extra_disc_pct / Decimal('100')) if extra_disc_pct > Decimal('0') else Decimal('1')
req_sale_type = request.data.get('saleType', 'RETAIL')

for item_data in items_data:
    batch_id = item_data.get('batchId')
    if not batch_id:
        continue
    batch_obj = Batch.objects.filter(id=batch_id, outlet=outlet).select_related('product').first()
    if not batch_obj:
        continue

    # Resolve cost floor based on sale type
    if req_sale_type == 'WHOLESALE':
        cost_floor = batch_obj.pts if (batch_obj.pts and batch_obj.pts > Decimal('0')) else (batch_obj.purchase_rate or batch_obj.landing_rate or Decimal('0'))
    else:
        cost_floor = batch_obj.ptr if (batch_obj.ptr and batch_obj.ptr > Decimal('0')) else (batch_obj.landing_rate or batch_obj.purchase_rate or Decimal('0'))

    if cost_floor > Decimal('0'):
        pack_size = Decimal(str(batch_obj.pack_size or 1))
        qty_strips = Decimal(str(item_data.get('qtyStrips', 0)))
        qty_loose = Decimal(str(item_data.get('qtyLoose', 0)))
        free_qty_strips = Decimal(str(item_data.get('freeQtyStrips', 0)))
        effective_qty = qty_strips + (qty_loose / pack_size) + free_qty_strips

        if effective_qty > Decimal('0'):
            taxable_amt = Decimal(str(item_data.get('taxableAmount', 0)))
            gst_amt = Decimal(str(item_data.get('gstAmount', 0)))
            item_total = taxable_amt + gst_amt
            if item_total <= Decimal('0') and item_data.get('totalAmount'):
                item_total = Decimal(str(item_data.get('totalAmount', 0)))
            if item_total <= Decimal('0'):
                rate_val = Decimal(str(item_data.get('rate', batch_obj.mrp)))
                disc_pct = Decimal(str(item_data.get('discountPct', 0)))
                item_total = (rate_val * effective_qty) * (Decimal('1') - disc_pct / Decimal('100'))

            final_item_amount = item_total * discount_factor
            net_rate_per_pack = final_item_amount / effective_qty

            if net_rate_per_pack < (cost_floor - Decimal('0.005')):
                prod_name = item_data.get('name') or item_data.get('productName') or (batch_obj.product.name if batch_obj.product else f"Batch {batch_obj.batch_no}")
                return Response(
                    {
                        'detail': f"Loss Sale Prevented: Cannot sell {prod_name} below its purchase rate of ₹{cost_floor:.2f}.",
                        'code': 'LOSS_SALE_PREVENTED',
                        'batch_id': str(batch_obj.id),
                        'product_name': prod_name,
                        'cost_floor': float(cost_floor),
                        'net_rate': float(net_rate_per_pack.quantize(Decimal('0.01')))
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
```

Additionally, `validate_sale_price` in [`apps/backend/apps/billing/utils/pricing.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/utils/pricing.py) was converted from a non-blocking warning to an enforced lock (`'block': True, 'valid': False`).

---

## 2. Frontend Math Engine (`billingMarginUtils.ts`)

File: [`apps/frontend/lib/billingMarginUtils.ts`](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts)

The frontend math engine accurately calculates row-level derived booleans (`isLossSale`) and global bill margin status (`isGlobalLoss`), accounting for fractional/loose packs, item-level discounts, and bill-level extra discounts:

```typescript
export function calculateLineMargin(item: CartItem, extraDiscountPct: number = 0): LineMarginInfo {
    const packSize = (item.packSize && item.packSize > 0) ? item.packSize : 1;
    const effectivePackQty = typeof item.totalQty === 'number' && item.totalQty > 0
        ? item.totalQty
        : (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize));

    // Cost floor: prioritize item.ptr, fallback to landingRate or purchaseRate
    const costFloor = Number(
        (item.ptr && item.ptr > 0) 
            ? item.ptr 
            : (item.landingRate ?? item.purchaseRate ?? 0)
    );
    const landingRate = Number(item.landingRate ?? item.purchaseRate ?? costFloor);
    const lineLandingCost = Math.round(costFloor * effectivePackQty * 100) / 100;

    // Base selling amount for this line (after item discount)
    let baseSellingAmount = Number(item.totalAmount || 0);
    if (baseSellingAmount === 0 && effectivePackQty > 0) {
        const baseRate = Number(item.rate || item.saleRate || item.mrp || 0);
        const discPct = Number(item.discountPct || 0);
        baseSellingAmount = baseRate * effectivePackQty * (1 - discPct / 100);
    }

    // Apply global bill extra discount % proportionally
    const discountFactor = extraDiscountPct > 0 ? (1 - extraDiscountPct / 100) : 1;
    const finalRowAmount = Math.round(baseSellingAmount * discountFactor * 100) / 100;

    const sellingPricePerPack = effectivePackQty > 0 ? (finalRowAmount / effectivePackQty) : Number(item.rate || item.saleRate || 0);
    const margin = Math.round((sellingPricePerPack - costFloor) * 100) / 100;
    const marginPct = sellingPricePerPack > 0 ? Math.round((margin / sellingPricePerPack) * 10000) / 100 : 0;
    const lineGrossProfit = Math.round((finalRowAmount - lineLandingCost) * 100) / 100;

    // Loss-Sale: Selling below cost floor (PTR / Landing Cost)
    const isLossSale = costFloor > 0 && effectivePackQty > 0 && (sellingPricePerPack < (costFloor - 0.005));

    return {
        margin,
        marginPct,
        lineGrossProfit,
        lineLandingCost,
        landingRate,
        costFloor,
        sellingPricePerPack: Math.round(sellingPricePerPack * 100) / 100,
        finalRowAmount,
        isLossSale,
    };
}

export function calculateTotalMargin(
    cart: CartItem[],
    billRevenue?: number,
    billDiscountAmount: number = 0,
    extraDiscountPct: number = 0
): TotalMarginInfo {
    // ...
    // Global margin check: grandTotal < totalLandingCost OR any item sold at loss
    const isGlobalLoss = (typeof billRevenue === 'number' && billRevenue > 0 && billRevenue < (totalLandingCost - 0.005)) || hasLossSale;

    return {
        totalLandingCost,
        totalBillAmount: Math.round(finalBillAmount * 100) / 100,
        totalProfit,
        totalGrossProfit: totalProfit,
        totalMargin: totalProfit,
        totalMarginPct: profitMarginPct,
        profitMarginPct,
        isGlobalLoss,
        hasLossSale,
    };
}
```

---

## 3. UI Lock & Visual Warnings

### A. Item Grid Visual Indicators (`MainInvoiceWorkspace.tsx`)
File: [`apps/frontend/components/billing/MainInvoiceWorkspace.tsx`](file:///home/asta/coding/MDF/apps/frontend/components/billing/MainInvoiceWorkspace.tsx)

When an item's net rate falls below its PTR:
1. The **Amount** column cell dynamically turns red (`bg-red-50 text-red-600 border border-red-200`).
2. A red badge is rendered below the amount: `Below PTR (₹X.XX)`.
3. A hover tooltip states: `"Rate is below PTR (₹X.XX)"`.

```tsx
<td 
    className={cn(
        "px-3 py-1.5 text-[13px] font-black text-right transition-colors",
        lineMargin.isLossSale 
            ? "bg-red-50 text-red-600 border border-red-200" 
            : "text-slate-800"
    )}
    title={lineMargin.isLossSale ? `Rate is below PTR (₹${lineMargin.costFloor.toFixed(2)})` : undefined}
>
    <div className="flex flex-col items-end">
        <span>₹{item.totalAmount.toFixed(2)}</span>
        {lineMargin.isLossSale && (
            <span 
                className="text-[9px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded flex items-center gap-0.5 mt-0.5"
                title={`Rate is below PTR (₹${lineMargin.costFloor.toFixed(2)})`}
            >
                Below PTR (₹{lineMargin.costFloor.toFixed(2)})
            </span>
        )}
    </div>
</td>
```

### B. Summary Rail Lock & Checkout Button Disable (`useCheckout.ts` & `RightBillingRail.tsx`)
Files: [`apps/frontend/hooks/useCheckout.ts`](file:///home/asta/coding/MDF/apps/frontend/hooks/useCheckout.ts) & [`apps/frontend/components/billing/RightBillingRail.tsx`](file:///home/asta/coding/MDF/apps/frontend/components/billing/RightBillingRail.tsx)

1. `useCheckout` evaluates `isLossSale` and `isGlobalLoss` and includes `!isLossSale && !isGlobalLoss` in `canCheckout`.
2. When either flag is `true`, `RightBillingRail`:
   - Forcefully disables the **Collect Payment / Save** button (`disabled={!canCheckout || ...}`).
   - Displays a prominent red warning banner above the button:
     `"Checkout Locked: One or more items are being sold below landing cost."`
   - Displays an explanatory validation warning in the footer error rail.

```tsx
{/* Loss-Sale Prevention Lock Banner */}
{(isLossSale || isGlobalLoss) && (
    <div 
        data-testid="loss-sale-lock-banner"
        className="w-full mb-3 p-3 bg-red-600/15 border-2 border-red-500/80 rounded-lg text-red-400 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-sm"
    >
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <span>Checkout Locked: One or more items are being sold below landing cost.</span>
    </div>
)}

<button 
    data-testid="checkout-button"
    onClick={handleCheckout}
    disabled={!canCheckout || (paymentMethod === 'credit' && !!isCreditBlocked)}
    className="..."
>
    {/* Button label */}
</button>
```

---

## 4. Verification & Automated Test Results

### Backend Pytest Suite
Executed inside `mediflow_backend`:
- `test_sale_create_prevents_loss_sale_below_ptr`: **PASSED** (verifies HTTP 400 when selling below PTR).
- `test_sale_create_prevents_loss_sale_via_bill_discount`: **PASSED** (verifies HTTP 400 when global discount forces net rate below PTR).
- `test_sale_create_api`: **PASSED** (verifies valid sale at/above PTR generates 201 Created).
- `test_sales_core.py`: **6 passed in 20.78s**.

### Frontend Jest Test Suite
Executed via Jest in `apps/frontend`:
- `tests/unit/billingMarginUtils.test.ts`: **10 passed in 0.359s** (verifies PTR margin calculations, extra discount scaling, loose splits, and global loss).
- `tests/unit/LossSaleLock.test.tsx`: **6 passed in 0.652s** (verifies math engine, visual red badge, checkout button disablement, and lock banner).
- `components/billing/MainInvoiceWorkspace.test.tsx`: **2 passed in 0.718s**.
