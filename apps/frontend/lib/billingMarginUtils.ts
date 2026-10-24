import { CartItem } from '../types';

/**
 * Returns the maximum flat bill discount (₹) this cart can absorb without
 * any item going below its cost floor. Use this to enforce a hard ceiling
 * on the "Extra Discount" input field in the UI, preventing impossible discounts
 * from ever reaching the Smart Cap / API validation layer.
 *
 * Formula:  MAX_DISC = Σ max(0, lineBaseAmount - lineCostFloorInclusive)
 */
export function getMaxAllowableBillDiscount(
    cart: CartItem[],
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): { maxDiscountAmount: number; totalBaseAmount: number; maxDiscountPct: number } {
    if (!cart || cart.length === 0) return { maxDiscountAmount: 0, totalBaseAmount: 0, maxDiscountPct: 0 };

    let totalBase = 0;
    let totalHeadroom = 0;

    for (let idx = 0; idx < cart.length; idx++) {
        const item = cart[idx];
        const packSize = (Number(item.packSize) && Number(item.packSize) > 0) ? Number(item.packSize) : 1;
        const hasExplicit = (Number(item.qtyStrips || 0) > 0) || (Number(item.qtyLoose || 0) > 0);
        const effectiveQty = hasExplicit
            ? (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize))
            : (typeof item.totalQty === 'number' && item.totalQty > 0 ? Number(item.totalQty) : 0);

        // 100% free promo item — contributes no revenue and no floor, skip
        if (effectiveQty <= 0 && Number(item.freeQtyStrips || 0) > 0) continue;
        if (effectiveQty <= 0) continue;

        const rawLanding = Number(item.landingRate ?? (item as any).landing_rate);
        const rawPtr = Number(item.ptr);
        const rawPts = Number(item.pts);
        const rawPurchase = Number(item.purchaseRate ?? (item as any).purchase_rate);

        let costFloor = 0;
        if (saleType === 'WHOLESALE') {
            costFloor = (!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase
                : ((!isNaN(rawPts) && rawPts > 0) ? rawPts
                    : ((!isNaN(rawLanding) && rawLanding > 0) ? rawLanding
                        : ((!isNaN(rawPtr) && rawPtr > 0) ? rawPtr : 0)));
        } else {
            costFloor = (!isNaN(rawLanding) && rawLanding > 0) ? rawLanding
                : ((!isNaN(rawPtr) && rawPtr > 0) ? rawPtr
                    : ((!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase : 0));
        }

        const gstRate = Number(item.gstRate ?? item.gstPct ?? 0);
        const taxMultiplier = 1 + (gstRate / 100);
        const lineCostFloor = costFloor > 0 ? Math.round(costFloor * taxMultiplier * effectiveQty * 100) / 100 : 0;

        let baseAmount = Number(item.totalAmount);
        if (isNaN(baseAmount) || baseAmount <= 0) {
            const baseRate = Number(item.rate || item.saleRate || item.mrp || 0);
            const discPct = Number(item.discountPct || 0);
            const rateDiscounted = baseRate * (1 - discPct / 100);
            baseAmount = saleType === 'WHOLESALE'
                ? rateDiscounted * effectiveQty * taxMultiplier
                : rateDiscounted * effectiveQty;
        }
        baseAmount = Math.round(baseAmount * 100) / 100;

        totalBase = Math.round((totalBase + baseAmount) * 100) / 100;
        totalHeadroom = Math.round((totalHeadroom + Math.max(0, baseAmount - lineCostFloor)) * 100) / 100;
    }

    const maxDiscountPct = totalBase > 0 ? Math.round((totalHeadroom / totalBase) * 10000) / 100 : 0;
    return { maxDiscountAmount: totalHeadroom, totalBaseAmount: totalBase, maxDiscountPct };
}

export interface LineMarginInfo {
    margin: number;             // Margin per pack: sellingPricePerPack - costFloor
    marginPct: number;          // Margin %: (margin / sellingPricePerPack) * 100
    lineGrossProfit: number;    // Line total profit: lineSellingAmount - lineLandingCost
    lineLandingCost: number;    // Line total landing cost: costFloor * effectivePackQty
    landingRate: number;        // Landing cost per pack
    costFloor: number;          // Cost floor per pack: item.ptr ?? landingRate ?? purchaseRate
    sellingPricePerPack: number;// Actual selling price per pack (after item and bill discount)
    finalRowAmount: number;     // Final row amount (after item and bill discount)
    isLossSale: boolean;        // true if unit selling price is strictly less than costFloor
}

export interface TotalMarginInfo {
    totalLandingCost: number;   // Total bill landing cost (distributor cost of goods / PTR sum)
    totalBillAmount: number;    // Total bill revenue / payable amount
    totalProfit: number;        // Total profit: totalBillAmount - totalLandingCost
    totalGrossProfit: number;   // Alias for totalProfit (backwards compatibility)
    totalMargin: number;        // Alias for totalProfit (backwards compatibility)
    totalMarginPct: number;     // Profit margin %: (totalProfit / totalBillAmount) * 100
    profitMarginPct: number;    // Alias for totalMarginPct
    isGlobalLoss: boolean;      // true if grandTotal < totalLandingCost OR any item isLossSale
    hasLossSale: boolean;       // true if any item isLossSale
}

/**
 * Calculates accurate margin and profit for an individual cart item,
 * properly accounting for fractional/loose packs, line-level discounts,
 * and optional bill-level extra discount %.
 */
export function calculateLineMargin(
    item: CartItem, 
    extraDiscountPct: number = 0,
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): LineMarginInfo {
    const packSize = (Number(item.packSize) && Number(item.packSize) > 0) ? Number(item.packSize) : 1;
    
    // Effective pack quantity: prefer explicit strips + loose / packSize if either is non-zero,
    // otherwise fallback to totalQty or 1.
    const hasExplicitStripsOrLoose = (Number(item.qtyStrips || 0) > 0) || (Number(item.qtyLoose || 0) > 0);
    const effectivePackQty = hasExplicitStripsOrLoose
        ? (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize))
        : (typeof item.totalQty === 'number' && item.totalQty > 0
            ? Number(item.totalQty)
            : (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize)));

    // Cost floor: Force type coercion.
    // If saleType === 'WHOLESALE', prioritize rawPurchase (fallback to rawPts > rawLanding > rawPtr).
    // If saleType === 'RETAIL', prioritize rawLanding (fallback to rawPtr > rawPurchase).
    const rawLanding = Number(item.landingRate ?? (item as any).landing_rate);
    const rawPtr = Number(item.ptr);
    const rawPts = Number(item.pts);
    const rawPurchase = Number(item.purchaseRate ?? (item as any).purchase_rate);

    let costFloor = 0;
    if (saleType === 'WHOLESALE') {
        costFloor = (!isNaN(rawPurchase) && rawPurchase > 0)
            ? rawPurchase
            : ((!isNaN(rawPts) && rawPts > 0)
                ? rawPts
                : ((!isNaN(rawLanding) && rawLanding > 0)
                    ? rawLanding
                    : ((!isNaN(rawPtr) && rawPtr > 0) ? rawPtr : 0)));
    } else {
        costFloor = (!isNaN(rawLanding) && rawLanding > 0)
            ? rawLanding
            : ((!isNaN(rawPtr) && rawPtr > 0)
                ? rawPtr
                : ((!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase : 0));
    }

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
    let finalRowAmount = Math.round(baseSellingAmount * discountFactor * 100) / 100;

    // Tax multiplier for apples-to-apples tax inclusivity comparison
    const gstRate = Number(item.gstRate ?? item.gstPct ?? 0);
    const taxMultiplier = 1 + (gstRate / 100);
    const lineCostFloorInclusive = Math.round(costFloor * taxMultiplier * effectivePackQty * 100) / 100;

    // ── EDGE CASE: 100% Free Promotional Item (Scheme Safe Harbor) ────────────
    // If billed quantity is zero but free scheme quantity is non-zero, the customer
    // paid nothing for this item intentionally — it is a promotional gift.
    // Revenue = 0 by design; comparing against a cost floor would falsely flag
    // every such item as a loss sale. Skip the Smart Cap and loss-sale flag.
    const billedQty = effectivePackQty;  // already excludes free strips
    const freeQtyStrips = Number((item as any).freeQtyStrips || 0);
    if (billedQty <= 0 && freeQtyStrips > 0) {
        return {
            margin: 0,
            marginPct: 0,
            lineGrossProfit: 0,
            lineLandingCost: 0,
            landingRate,
            costFloor,
            sellingPricePerPack: 0,
            finalRowAmount: 0,
            isLossSale: false, // Safe harbor: promotional gift, not a loss sale
        };
    }
    // ── END Safe Harbor ───────────────────────────────────────────────────────

    // Smart Cap: If base amount is legal before bill discount, cap final row amount to cost floor.
    // IMPORTANT: GST (CGST/SGST) is derived STRICTLY AFTER this cap step using the
    // post-cap finalRowAmount, ensuring tax is never calculated on a discounted-below-floor amount.
    if (baseSellingAmount >= lineCostFloorInclusive && finalRowAmount < lineCostFloorInclusive) {
        finalRowAmount = lineCostFloorInclusive;
    }

    // Post-Cap: Tax-exclusive net selling price per pack for apples-to-apples comparison against costFloor.
    // Derived from post-cap finalRowAmount to guarantee GST sequencing is correct.
    const sellingPricePerPack = effectivePackQty > 0 ? (finalRowAmount / (effectivePackQty * taxMultiplier)) : Number(item.rate || item.saleRate || 0);
    const margin = Math.round((sellingPricePerPack - costFloor) * 100) / 100;
    const marginPct = sellingPricePerPack > 0 ? Math.round((margin / sellingPricePerPack) * 10000) / 100 : 0;
    const lineGrossProfit = Math.round((finalRowAmount - lineCostFloorInclusive) * 100) / 100;

    // Loss-Sale: Compare exact row amounts to prevent fractional reverse-division rounding drift
    const isLossSale = costFloor > 0 && effectivePackQty > 0 && (finalRowAmount < (lineCostFloorInclusive - 0.005));

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

export interface SmartDiscountAllocation {
    discountAmount: number;     // Total discount allocated to this item
    finalRowAmount: number;     // Final row amount (after discount and capping)
    finalTaxable: number;       // Final taxable amount (tax-exclusive)
    isSmartCapped: boolean;     // Whether this item hit its cost floor cap
    isLossSale: boolean;        // Whether this item is selling below cost floor
    effectiveRate: number;      // Selling rate per pack after discount
}

/**
 * Distributes a bill-level discount across cart items with Smart Capping and Dynamic Redistribution:
 * - Low-margin items are capped at their cost floors to prevent false loss-sale locks.
 * - Any "unabsorbed" discount from capped items is dynamically redistributed to high-margin items
 *   that have headroom, ensuring the customer receives the exact flat discount promised without
 *   breaking any individual item floors.
 */
export function distributeSmartDiscounts(
    cart: CartItem[],
    extraDiscountPct: number,
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): Map<string, SmartDiscountAllocation> {
    const allocations = new Map<string, SmartDiscountAllocation>();
    if (!cart || cart.length === 0) return allocations;

    interface ItemMeta {
        key: string;
        item: CartItem;
        effectiveQty: number;
        costFloor: number;
        taxMultiplier: number;
        lineCostFloor: number;       // Tax-inclusive cost floor
        baseAmount: number;          // Tax-inclusive base selling amount
        headroom: number;            // Maximum safe discount this item can absorb
        discount: number;            // Allocated discount
        isIllegalBase: boolean;      // True if already below floor before discount
    }

    const items: ItemMeta[] = [];
    let totalBaseAmount = 0;
    let totalHeadroom = 0;

    for (let idx = 0; idx < cart.length; idx++) {
        const item = cart[idx];
        const key = item.batchId || `item-${idx}`;
        const packSize = (Number(item.packSize) && Number(item.packSize) > 0) ? Number(item.packSize) : 1;
        const hasExplicit = (Number(item.qtyStrips || 0) > 0) || (Number(item.qtyLoose || 0) > 0);
        const effectiveQty = hasExplicit
            ? (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize))
            : (typeof item.totalQty === 'number' && item.totalQty > 0
                ? Number(item.totalQty)
                : (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize)));

        const rawLanding = Number(item.landingRate ?? (item as any).landing_rate);
        const rawPtr = Number(item.ptr);
        const rawPts = Number(item.pts);
        const rawPurchase = Number(item.purchaseRate ?? (item as any).purchase_rate);

        let costFloor = 0;
        if (saleType === 'WHOLESALE') {
            costFloor = (!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase
                : ((!isNaN(rawPts) && rawPts > 0) ? rawPts
                    : ((!isNaN(rawLanding) && rawLanding > 0) ? rawLanding
                        : ((!isNaN(rawPtr) && rawPtr > 0) ? rawPtr : 0)));
        } else {
            costFloor = (!isNaN(rawLanding) && rawLanding > 0) ? rawLanding
                : ((!isNaN(rawPtr) && rawPtr > 0) ? rawPtr
                    : ((!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase : 0));
        }

        const gstRate = Number(item.gstRate ?? item.gstPct ?? 0);
        const taxMultiplier = 1 + (gstRate / 100);
        const lineCostFloor = Math.round(costFloor * taxMultiplier * effectiveQty * 100) / 100;

        let baseAmount = Number(item.totalAmount);
        if (isNaN(baseAmount) || baseAmount <= 0) {
            const baseRate = Number(item.rate || item.saleRate || item.mrp || 0);
            const discPct = Number(item.discountPct || 0);
            const baseRateDiscounted = baseRate * (1 - discPct / 100);
            baseAmount = (saleType === 'WHOLESALE')
                ? baseRateDiscounted * effectiveQty * taxMultiplier
                : baseRateDiscounted * effectiveQty;
        }
        baseAmount = Math.round(baseAmount * 100) / 100;

        const isIllegalBase = costFloor > 0 && effectiveQty > 0 && (baseAmount < lineCostFloor - 0.005);
        const headroom = isIllegalBase ? 0 : Math.max(0, Math.round((baseAmount - lineCostFloor) * 100) / 100);

        items.push({
            key,
            item,
            effectiveQty,
            costFloor,
            taxMultiplier,
            lineCostFloor,
            baseAmount,
            headroom,
            discount: 0,
            isIllegalBase,
        });

        totalBaseAmount = Math.round((totalBaseAmount + baseAmount) * 100) / 100;
        totalHeadroom = Math.round((totalHeadroom + headroom) * 100) / 100;
    }

    if (extraDiscountPct <= 0 || totalBaseAmount <= 0) {
        for (const meta of items) {
            const sellingPricePerPack = meta.effectiveQty > 0 ? (meta.baseAmount / (meta.effectiveQty * meta.taxMultiplier)) : Number(meta.item.rate || 0);
            const finalTaxable = Math.round((meta.baseAmount / meta.taxMultiplier) * 100) / 100;
            allocations.set(meta.key, {
                discountAmount: 0,
                finalRowAmount: meta.baseAmount,
                finalTaxable,
                isSmartCapped: false,
                isLossSale: meta.isIllegalBase,
                effectiveRate: Math.round(sellingPricePerPack * 100) / 100,
            });
        }
        return allocations;
    }

    const targetBillDiscount = Math.round((totalBaseAmount * (extraDiscountPct / 100)) * 100) / 100;

    // ── EDGE CASE: Impossible / Excess Discount (Max Discount Ceiling) ────────
    // If the requested flat discount exceeds the total available profit headroom,
    // cap the distributed amount to totalHeadroom. This prevents any item from
    // going below its cost floor. The remaining unabsorbed discount is silently
    // truncated here; the UI should enforce this ceiling via getMaxAllowableBillDiscount.
    const totalDistributable = Math.min(targetBillDiscount, totalHeadroom);
    // ── END Max Discount Ceiling ──────────────────────────────────────────────

    // Initial proportional pass based on base amounts
    let remainingToDistribute = totalDistributable;
    for (const it of items) {
        if (it.headroom <= 0 || totalBaseAmount <= 0) continue;
        const initialShare = Math.round((totalDistributable * (it.baseAmount / totalBaseAmount)) * 100) / 100;
        const alloc = Math.min(initialShare, it.headroom, remainingToDistribute);
        it.discount = alloc;
        remainingToDistribute = Math.round((remainingToDistribute - alloc) * 100) / 100;
    }

    // Dynamic redistribution pass: distribute remaining unabsorbed discount to items with remaining headroom
    let loopGuard = 0;
    while (remainingToDistribute > 0.005 && loopGuard < 10) {
        loopGuard++;
        const eligibleItems = items.filter(it => Math.round((it.headroom - it.discount) * 100) > 0);
        if (eligibleItems.length === 0) break;

        const totalEligibleHeadroom = eligibleItems.reduce((sum, it) => sum + (it.headroom - it.discount), 0);
        if (totalEligibleHeadroom <= 0) break;

        let distributedThisLoop = 0;
        for (const it of eligibleItems) {
            const avail = Math.round((it.headroom - it.discount) * 100) / 100;
            const share = Math.round((remainingToDistribute * (avail / totalEligibleHeadroom)) * 100) / 100;
            const toAdd = Math.min(share, avail, remainingToDistribute);
            it.discount = Math.round((it.discount + toAdd) * 100) / 100;
            distributedThisLoop = Math.round((distributedThisLoop + toAdd) * 100) / 100;
            remainingToDistribute = Math.round((remainingToDistribute - toAdd) * 100) / 100;
            if (remainingToDistribute <= 0.005) break;
        }

        if (distributedThisLoop <= 0.005) break;
    }

    // Final allocation mapping
    for (const meta of items) {
        const finalRowAmount = Math.round(Math.max(0, meta.baseAmount - meta.discount) * 100) / 100;
        const isCapped = meta.headroom > 0 && Math.abs(finalRowAmount - meta.lineCostFloor) <= 0.01;
        const sellingPricePerPack = meta.effectiveQty > 0 ? (finalRowAmount / (meta.effectiveQty * meta.taxMultiplier)) : Number(meta.item.rate || 0);
        // Loss-Sale: Compare exact row amounts to prevent fractional reverse-division rounding drift
        const isLossSale = meta.costFloor > 0 && meta.effectiveQty > 0 && (finalRowAmount < (meta.lineCostFloor - 0.005));
        
        const finalTaxable = Math.round((finalRowAmount / meta.taxMultiplier) * 100) / 100;

        allocations.set(meta.key, {
            discountAmount: meta.discount,
            finalRowAmount,
            finalTaxable,
            isSmartCapped: isCapped,
            isLossSale,
            effectiveRate: Math.round(sellingPricePerPack * 100) / 100,
        });
    }

    return allocations;
}

/**
 * Calculates total bill landing cost and true profit according to landing cost.
 * billRevenue: The grand total / payable amount of the bill (after bill discounts and round-off).
 * billDiscountAmount: Optional additional discount applied at the bill level.
 * extraDiscountPct: Optional bill-level extra discount percentage.
 */
export function calculateTotalMargin(
    cart: CartItem[],
    billRevenue?: number,
    billDiscountAmount: number = 0,
    extraDiscountPct: number = 0,
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): TotalMarginInfo {
    if (!cart || cart.length === 0) {
        return {
            totalLandingCost: 0,
            totalBillAmount: 0,
            totalProfit: 0,
            totalGrossProfit: 0,
            totalMargin: 0,
            totalMarginPct: 0,
            profitMarginPct: 0,
            isGlobalLoss: false,
            hasLossSale: false,
        };
    }

    const smartAllocations = distributeSmartDiscounts(cart, extraDiscountPct, saleType);

    let totalLandingCost = 0;
    let itemsSellingTotal = 0;
    let itemsGrossProfit = 0;
    let hasLossSale = false;

    for (let idx = 0; idx < cart.length; idx++) {
        const item = cart[idx];
        const key = item.batchId || `item-${idx}`;
        const alloc = smartAllocations.get(key);

        const line = calculateLineMargin(item, extraDiscountPct, saleType);
        totalLandingCost += line.lineLandingCost;

        const rowAmount = alloc ? alloc.finalRowAmount : line.finalRowAmount;
        const rowLoss = alloc ? alloc.isLossSale : line.isLossSale;

        itemsSellingTotal += rowAmount;
        itemsGrossProfit += (rowAmount - line.lineLandingCost);
        if (rowLoss) {
            hasLossSale = true;
        }
    }

    totalLandingCost = Math.round(totalLandingCost * 100) / 100;
    itemsGrossProfit = Math.round(itemsGrossProfit * 100) / 100;

    const finalBillAmount = typeof billRevenue === 'number' && billRevenue >= 0
        ? billRevenue
        : Math.max(0, itemsSellingTotal - billDiscountAmount);

    const totalProfit = (billDiscountAmount > 0 && extraDiscountPct === 0)
        ? Math.round((itemsGrossProfit - billDiscountAmount) * 100) / 100
        : (typeof billRevenue === 'number' && Math.abs(billRevenue - itemsSellingTotal) > 1 && itemsSellingTotal > billRevenue && (itemsSellingTotal - totalLandingCost) === itemsGrossProfit)
            ? itemsGrossProfit
            : Math.round((finalBillAmount - totalLandingCost) * 100) / 100;

    const profitMarginPct = finalBillAmount > 0
        ? Math.round((totalProfit / finalBillAmount) * 10000) / 100
        : 0;

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
