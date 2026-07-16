import { Batch } from '@/types';

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
    gstRate: number
): RowTotals {
    const s = parseInt(qtyStripsRaw) || 0;
    const l = parseInt(qtyLooseRaw) || 0;
    const dVal = parseFloat(discountValueRaw) || 0;
    const tQtyLoose = (s * currentBatch.packSize) + l;
    const tQtyFractional = s + (l / currentBatch.packSize);
    
    const saleRate = currentBatch.saleRate ?? currentBatch.mrp;
    const rawTotal = saleRate * tQtyFractional;

    let dPct = 0;
    let dAmount = 0;
    if (discountType === 'percentage') {
        dPct = dVal;
        dAmount = rawTotal * (dPct / 100);
    } else {
        dAmount = dVal;
        dPct = rawTotal > 0 ? (dAmount / rawTotal) * 100 : 0;
    }

    const rate = saleRate * (1 - (dPct / 100));
    const sellAmount = rate * tQtyFractional;
    
    // Purchase rate per pack
    const totalCost = (currentBatch.purchaseRate || 0) * tQtyFractional;
    
    const marginAmount = sellAmount - totalCost;
    const marginPct = sellAmount > 0 ? (marginAmount / sellAmount) * 100 : 0;

    const isLowMargin = marginPct < 10 && marginPct >= 0;
    const isNegativeMargin = marginPct < 0;
    const exceedsStock = tQtyLoose > (currentBatch.qtyStrips * currentBatch.packSize + currentBatch.qtyLoose);
    const isDiscountInvalid = discountType === 'percentage' 
        ? (dVal < 0 || dVal > 100) 
        : (dVal < 0 || dVal > rawTotal);
    const isQtyZero = tQtyFractional === 0;

    const isValid = !isDiscountInvalid && !isQtyZero && !isNegativeMargin;

    const taxableAmount = (rate * tQtyFractional) / (1 + gstRate / 100);
    const gstAmount = (rate * tQtyFractional) - taxableAmount;

    return {
        tQtyFractional,
        tQtyLoose,
        rate,
        sellAmount,
        dPct,
        dAmount,
        totalCost,
        marginAmount,
        marginPct,
        isLowMargin,
        isNegativeMargin,
        exceedsStock,
        isDiscountInvalid,
        isQtyZero,
        isValid,
        taxableAmount,
        gstAmount
    };
}
