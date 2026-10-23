import { CartItem } from '../types';

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

    // Smart Cap: If base amount is legal, do not let bill discount push it below cost floor
    if (baseSellingAmount >= lineLandingCost && finalRowAmount < lineLandingCost) {
        finalRowAmount = lineLandingCost;
    }

    // Unified formula: (Final Row Amount / Quantity)
    const sellingPricePerPack = effectivePackQty > 0 ? (finalRowAmount / effectivePackQty) : Number(item.rate || item.saleRate || 0);
    const margin = Math.round((sellingPricePerPack - costFloor) * 100) / 100;
    const marginPct = sellingPricePerPack > 0 ? Math.round((margin / sellingPricePerPack) * 10000) / 100 : 0;
    const lineGrossProfit = Math.round((finalRowAmount - lineLandingCost) * 100) / 100;

    // Loss-Sale: Strictly flag ONLY when mathematically proven unit net rate is less than unit PTR / cost floor
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

    let totalLandingCost = 0;
    let itemsSellingTotal = 0;
    let itemsGrossProfit = 0;
    let hasLossSale = false;

    for (const item of cart) {
        const line = calculateLineMargin(item, extraDiscountPct, saleType);
        totalLandingCost += line.lineLandingCost;
        itemsSellingTotal += line.finalRowAmount;
        itemsGrossProfit += line.lineGrossProfit;
        if (line.isLossSale) {
            hasLossSale = true;
        }
    }

    totalLandingCost = Math.round(totalLandingCost * 100) / 100;
    itemsGrossProfit = Math.round(itemsGrossProfit * 100) / 100;

    const finalBillAmount = typeof billRevenue === 'number' && billRevenue >= 0
        ? billRevenue
        : Math.max(0, itemsSellingTotal - billDiscountAmount);

    // If extraDiscountPct was already applied inside calculateLineMargin, itemsGrossProfit
    // already reflects that discount. Do not double-subtract billDiscountAmount unless extraDiscountPct == 0.
    const totalProfit = (billDiscountAmount > 0 && extraDiscountPct === 0)
        ? Math.round((itemsGrossProfit - billDiscountAmount) * 100) / 100
        : (typeof billRevenue === 'number' && Math.abs(billRevenue - itemsSellingTotal) > 1 && itemsSellingTotal > billRevenue && (itemsSellingTotal - totalLandingCost) === itemsGrossProfit)
            ? itemsGrossProfit // fallback if billRevenue was passed as a denominator subtotal
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
