import { CartItem } from '../types';

export interface LineMarginInfo {
    margin: number;             // Margin per pack: sellingPricePerPack - landingRate
    marginPct: number;          // Margin %: (margin / sellingPricePerPack) * 100
    lineGrossProfit: number;    // Line total profit: lineSellingAmount - lineLandingCost
    lineLandingCost: number;    // Line total landing cost: landingRate * effectivePackQty
    landingRate: number;        // Landing cost per pack
    sellingPricePerPack: number;// Actual selling price per pack (after item discount)
}

export interface TotalMarginInfo {
    totalLandingCost: number;   // Total bill landing cost (distributor cost of goods)
    totalBillAmount: number;    // Total bill revenue / payable amount
    totalProfit: number;        // Total profit: totalBillAmount - totalLandingCost
    totalGrossProfit: number;   // Alias for totalProfit (backwards compatibility)
    totalMargin: number;        // Alias for totalProfit (backwards compatibility)
    totalMarginPct: number;     // Profit margin %: (totalProfit / totalBillAmount) * 100
    profitMarginPct: number;    // Alias for totalMarginPct
}

/**
 * Calculates accurate margin and profit for an individual cart item,
 * properly accounting for fractional/loose packs and line-level discounts.
 */
export function calculateLineMargin(item: CartItem): LineMarginInfo {
    const packSize = (item.packSize && item.packSize > 0) ? item.packSize : 1;
    const effectivePackQty = typeof item.totalQty === 'number' && item.totalQty > 0
        ? item.totalQty
        : (Number(item.qtyStrips || 0) + (Number(item.qtyLoose || 0) / packSize));

    const landingRate = Number(item.landingRate ?? item.purchaseRate ?? 0);
    const lineLandingCost = Math.round(landingRate * effectivePackQty * 100) / 100;

    // Actual selling amount for this line (after item discount)
    let lineSellingAmount = Number(item.totalAmount || 0);
    if (lineSellingAmount === 0 && effectivePackQty > 0) {
        const baseRate = Number(item.rate || item.saleRate || item.mrp || 0);
        const discPct = Number(item.discountPct || 0);
        lineSellingAmount = baseRate * effectivePackQty * (1 - discPct / 100);
    }

    const lineGrossProfit = Math.round((lineSellingAmount - lineLandingCost) * 100) / 100;
    const sellingPricePerPack = effectivePackQty > 0 ? (lineSellingAmount / effectivePackQty) : Number(item.rate || item.saleRate || 0);
    const margin = Math.round((sellingPricePerPack - landingRate) * 100) / 100;
    const marginPct = sellingPricePerPack > 0 ? Math.round((margin / sellingPricePerPack) * 10000) / 100 : 0;

    return {
        margin,
        marginPct,
        lineGrossProfit,
        lineLandingCost,
        landingRate,
        sellingPricePerPack: Math.round(sellingPricePerPack * 100) / 100,
    };
}

/**
 * Calculates total bill landing cost and true profit according to landing cost.
 * billRevenue: The grand total / payable amount of the bill (after bill discounts and round-off).
 * billDiscountAmount: Optional additional discount applied at the bill level.
 */
export function calculateTotalMargin(
    cart: CartItem[],
    billRevenue?: number,
    billDiscountAmount: number = 0
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
        };
    }

    let totalLandingCost = 0;
    let itemsSellingTotal = 0;

    for (const item of cart) {
        const line = calculateLineMargin(item);
        totalLandingCost += line.lineLandingCost;
        itemsSellingTotal += Number(item.totalAmount || 0);
    }

    totalLandingCost = Math.round(totalLandingCost * 100) / 100;

    // Use billRevenue (e.g. totals.grandTotal) if supplied and > 0,
    // otherwise fallback to items selling total minus any bill-level discount.
    const finalBillAmount = typeof billRevenue === 'number' && billRevenue >= 0
        ? billRevenue
        : Math.max(0, itemsSellingTotal - billDiscountAmount);

    const totalProfit = Math.round((finalBillAmount - totalLandingCost) * 100) / 100;
    const profitMarginPct = finalBillAmount > 0
        ? Math.round((totalProfit / finalBillAmount) * 10000) / 100
        : 0;

    return {
        totalLandingCost,
        totalBillAmount: Math.round(finalBillAmount * 100) / 100,
        totalProfit,
        totalGrossProfit: totalProfit,
        totalMargin: totalProfit,
        totalMarginPct: profitMarginPct,
        profitMarginPct,
    };
}
