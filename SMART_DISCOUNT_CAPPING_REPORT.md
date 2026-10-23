# Margin-Aware Smart Discount Capping Report

## Executive Summary
When applying a global bill discount (`extraDiscountPct`), the reduction is distributed proportionally across all items in the basket. In high-value or mixed-basket scenarios, naturally low-margin items can be pushed below their statutory or defined cost floors (`landing_rate` for Retail, `purchase_rate` for Wholesale). Previously, this triggered the `isLossSale` lock and blocked valid, profitable transactions.

To resolve this without compromising loss-sale protection, we implemented **Smart Capping**:
- If an item was priced **legally** before the global bill discount (`baseSellingAmount >= lineLandingCost` / `item_amt >= line_cost_floor`), but the global bill discount pushed it below cost floor, its final row amount is **capped exactly at the cost floor**.
- If an item was already priced below the cost floor prior to the bill discount (`baseSellingAmount < lineLandingCost`), it is **not** capped, and the `isLossSale` lock rightfully prevents the transaction.

---

## 1. Frontend Math Implementation

**Target File:** [`apps/frontend/lib/billingMarginUtils.ts`](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts#L90-L98)  
**Function:** [`calculateLineMargin`](file:///home/asta/coding/MDF/apps/frontend/lib/billingMarginUtils.ts#L22)

### TypeScript Snippet
```typescript
    // Apply extra discount % (bill-level) proportionally
    const discountFactor = extraDiscountPct > 0 ? (1 - extraDiscountPct / 100) : 1;
    let finalRowAmount = Math.round(baseSellingAmount * discountFactor * 100) / 100;

    // Smart Cap: If base amount is legal, do not let bill discount push it below cost floor
    if (baseSellingAmount >= lineLandingCost && finalRowAmount < lineLandingCost) {
        finalRowAmount = lineLandingCost;
    }

    // Unified formula: (Final Row Amount / Quantity)
    const sellingPricePerPack = effectivePackQty > 0 ? (finalRowAmount / effectivePackQty) : Number(item.rate || item.saleRate || 0);
```

---

## 2. Backend Math Implementation

**Target Files:**
1. [`apps/backend/apps/billing/views.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/views.py) (Pre-check & atomic iteration)
2. [`apps/backend/apps/billing/sale_services.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/sale_services.py) (Atomic transaction service)

### Python Snippet: SaleCreateView (`views.py`)
```python
# --- Pre-check Iteration (views.py: L682-L693) ---
line_cost_floor = cost_floor * effective_qty
final_item_amount = item_total * discount_factor

# Smart Cap: If item was legal before bill discount, cap the final row amount to the floor
if item_total >= line_cost_floor and final_item_amount < line_cost_floor:
    final_item_amount = line_cost_floor

net_rate_per_pack = final_item_amount / effective_qty

if net_rate_per_pack < (cost_floor - Decimal('0.005')):
    return Response(
        {"error": f"Loss Sale Prevented: Cannot sell {item_data.get('name', 'item')} below its {floor_label} of ₹{cost_floor:.2f}."},
        status=status.HTTP_400_BAD_REQUEST
    )

# --- Atomic Transaction Iteration (views.py: L1013-L1024) ---
line_cost_floor = c_floor * eff_qty
final_row_amt = item_amt * disc_factor

# Smart Cap: If item was legal before bill discount, cap the final row amount to the floor
if item_amt >= line_cost_floor and final_row_amt < line_cost_floor:
    final_row_amt = line_cost_floor

net_unit_price = final_row_amt / eff_qty

if c_floor > Decimal('0') and net_unit_price < (c_floor - Decimal('0.005')):
    transaction.set_rollback(True)
    return Response(
        {"error": f"Loss Sale Prevented: Cannot sell {item_data.get('name', 'item')} below its {floor_label} of ₹{c_floor:.2f}."},
        status=status.HTTP_400_BAD_REQUEST
    )
```

### Python Snippet: sale_services.py (`sale_services.py: L381-L394`)
```python
disc_factor = Decimal('1') - (sale_invoice.extra_discount_pct / Decimal('100')) if (sale_invoice.extra_discount_pct and sale_invoice.extra_discount_pct > Decimal('0')) else Decimal('1')
eff_qty = Decimal(str(alloc_billed)) + (Decimal(str(loose_to_deduct)) / Decimal(str(batch.pack_size or 1)))
line_cost_floor = c_floor * eff_qty
item_amt = pricing_result['line_total']
final_row_amt = item_amt * disc_factor

# Smart Cap: If item was legal before bill discount, cap the final row amount to the floor
if item_amt >= line_cost_floor and final_row_amt < line_cost_floor:
    final_row_amt = line_cost_floor

net_unit_price = (final_row_amt / eff_qty) if eff_qty > Decimal('0') else pricing_result['net_rate']

if c_floor > Decimal('0') and net_unit_price < (c_floor - Decimal('0.005')):
    transaction.set_rollback(True)
    prod_name = product.name if product else batch.batch_no
    raise ValidationError(f"Loss Sale Prevented: Cannot sell {prod_name} below its {floor_label} of ₹{c_floor:.2f}.")
```

---

## 3. Mathematical Verification & Logic Invariants

| Scenario | Base Price | Cost Floor | Bill Discount | Raw Disc Price | Smart Cap Price | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Legally Priced Item** | ₹90.00 | ₹80.00 | 20% | ₹72.00 | **₹80.00** | ✅ **Allowed** (Capped at floor, prevents false-positive lock) |
| **High-Margin Item** | ₹150.00 | ₹80.00 | 20% | ₹120.00 | **₹120.00** | ✅ **Allowed** (Above floor, full discount applied) |
| **Base Item Under Cost** | ₹70.00 | ₹80.00 | 20% | ₹56.00 | **₹56.00** | ❌ **Blocked** (Base was below floor; Smart Cap does not bail it out) |

---

## 4. Test Verification

### Frontend Unit Tests ([`tests/unit/LossSaleLock.test.tsx`](file:///home/asta/coding/MDF/apps/frontend/tests/unit/LossSaleLock.test.tsx))
- `calculateLineMargin smart caps global bill discount at cost floor for legally priced items` -> **PASSED**
- `calculateLineMargin continues to flag loss sale if base price was already below cost floor` -> **PASSED**
- Overall Frontend Tests: **8 test suites passed, 76 unit tests passed**.

### Backend Pytest Suite ([`apps/billing/tests/test_billing_api.py`](file:///home/asta/coding/MDF/apps/backend/apps/billing/tests/test_billing_api.py))
- `test_sale_create_smart_caps_discount_at_cost_floor` -> **PASSED**
- `test_sale_create_prevents_loss_sale_when_base_item_under_cost` -> **PASSED**
- `test_sale_create_api` -> **PASSED**
- `test_sale_create_invalid_payload` -> **PASSED**
- `test_sale_create_prevents_loss_sale_below_ptr` -> **PASSED**
- `test_sale_create_uses_landing_rate_strictly` -> **PASSED**
- `test_sale_create_wholesale_allows_sale_above_purchase_rate_even_if_below_landing` -> **PASSED**
- `test_sale_create_wholesale_prevents_loss_sale_below_purchase_rate` -> **PASSED**
- Overall Backend Tests: **8 passed in 21.45s**.
