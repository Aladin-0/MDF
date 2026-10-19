import { Batch } from '@/types';
import { bankersRound } from '@/utils/mathUtils';

export interface RowTotals {
    tQtyFractional: number;
    tQtyLoose: number;
    rate: number;
    sellAmount: number;
    dPct: number;
    dAmount: number;
    totalCost: number;
    marginAmount: number;
    marginPct: number;
    isLowMargin: boolean;
    isNegativeMargin: boolean;
    exceedsStock: boolean;
    isDiscountInvalid: boolean;
    isQtyZero: boolean;
    isValid: boolean;
    taxableAmount: number;
    gstAmount: number;
}

export function calculateRowTotals(
    currentBatch: Batch,
    qtyStripsRaw: string,
    qtyLooseRaw: string,
    discountType: 'percentage' | 'amount',
    discountValueRaw: string,
    gstRate: number,
    historicalBaseRate?: number,
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): RowTotals {
    const s = parseInt(qtyStripsRaw) || 0;
    const l = parseInt(qtyLooseRaw) || 0;
    const dVal = parseFloat(discountValueRaw) || 0;
    const tQtyLoose = (s * currentBatch.packSize) + l;
    const tQtyFractional = s + (l / currentBatch.packSize);
    
    const baseRate = historicalBaseRate ?? currentBatch.mrp;
    const rawTotal = baseRate * tQtyFractional;

    let dPct = 0;
    let dAmount = 0;
    if (discountType === 'percentage') {
        dPct = dVal;
        dAmount = rawTotal * (dPct / 100);
    } else {
        dAmount = dVal;
        dPct = rawTotal > 0 ? (dAmount / rawTotal) * 100 : 0;
    }

    const rate = baseRate * (1 - (dPct / 100));
    
    let taxableAmount = 0;
    let gstAmount = 0;
    let sellAmount = 0;

    if (saleType === 'WHOLESALE') {
        taxableAmount = rate * tQtyFractional;
        gstAmount = taxableAmount * (gstRate / 100);
        sellAmount = taxableAmount + gstAmount;
    } else {
        sellAmount = rate * tQtyFractional;
        taxableAmount = sellAmount / (1 + gstRate / 100);
        gstAmount = sellAmount - taxableAmount;
    }
    
    // Cost rate per pack: use landingRate if available, otherwise purchaseRate
    const costRate = Number(currentBatch.landingRate ?? currentBatch.purchaseRate ?? 0);
    const totalCost = costRate * tQtyFractional;
    
    // Calculate margin on pre-tax amount for accuracy, though maintaining backward compat structure
    const marginAmount = taxableAmount - totalCost;
    const marginPct = taxableAmount > 0 ? (marginAmount / taxableAmount) * 100 : 0;

    const isLowMargin = marginPct < 10 && marginPct >= 0;
    const isNegativeMargin = marginPct < 0;
    const exceedsStock = tQtyLoose > (currentBatch.qtyStrips * currentBatch.packSize + currentBatch.qtyLoose);
    const isDiscountInvalid = discountType === 'percentage' 
        ? (dVal < 0 || dVal > 100) 
        : (dVal < 0 || dVal > rawTotal);
    const isQtyZero = tQtyFractional === 0;

    const isValid = !isDiscountInvalid && !isQtyZero && !isNegativeMargin;

    return {
        tQtyFractional,
        tQtyLoose,
        rate: bankersRound(rate),
        sellAmount: bankersRound(sellAmount),
        dPct,
        dAmount: bankersRound(dAmount),
        totalCost: bankersRound(totalCost),
        marginAmount: bankersRound(marginAmount),
        marginPct,
        isLowMargin,
        isNegativeMargin,
        exceedsStock,
        isDiscountInvalid,
        isQtyZero,
        isValid,
        taxableAmount: bankersRound(taxableAmount),
        gstAmount: bankersRound(gstAmount)
    };
}
