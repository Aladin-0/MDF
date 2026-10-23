import { Batch, CartItem } from '@/types';
import { bankersRound } from '@/utils/mathUtils';

export interface RowTotals {
    tQtyFractional: number;
    tQtyLoose: number;
    rate: number;
    sellAmount: number;
    totalAmount: number;
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

export function calculateRowTotals(
    batchOrItem: Batch | CartItem,
    qtyStripsRawOrExtraDisc?: string | number,
    qtyLooseRawOrSaleType?: string | 'RETAIL' | 'WHOLESALE',
    discountTypeParam?: 'percentage' | 'amount',
    discountValueRawParam?: string,
    gstRateParam?: number,
    historicalBaseRateParam?: number,
    saleTypeParam: 'RETAIL' | 'WHOLESALE' = 'RETAIL'
): RowTotals {
    let currentBatch: Batch;
    let qtyStripsRaw: string;
    let qtyLooseRaw: string;
    let discountType: 'percentage' | 'amount';
    let discountValueRaw: string;
    let gstRate: number;
    let historicalBaseRate: number | undefined;
    let saleType: 'RETAIL' | 'WHOLESALE';

    if (typeof qtyStripsRawOrExtraDisc !== 'string') {
        const item = batchOrItem as CartItem;
        currentBatch = item as unknown as Batch;
        qtyStripsRaw = String(item.qtyStrips ?? 0);
        qtyLooseRaw = String(item.qtyLoose ?? 0);
        discountType = item.discountType || 'percentage';
        discountValueRaw = discountType === 'amount'
            ? String(item.discountAmount ?? 0)
            : String(item.discountPct ?? 0);
        gstRate = item.gstRate ?? item.gstPct ?? 0;
        historicalBaseRate = item.rate;
        saleType = (qtyLooseRawOrSaleType as 'RETAIL' | 'WHOLESALE') || 'RETAIL';
    } else {
        currentBatch = batchOrItem as Batch;
        qtyStripsRaw = qtyStripsRawOrExtraDisc;
        qtyLooseRaw = (qtyLooseRawOrSaleType as string) || '0';
        discountType = discountTypeParam || 'percentage';
        discountValueRaw = discountValueRawParam || '0';
        gstRate = gstRateParam ?? 0;
        historicalBaseRate = historicalBaseRateParam;
        saleType = saleTypeParam;
    }
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
    
    // Cost rate per pack: strictly branch based on Retail vs Wholesale prioritization
    const rawLanding = Number(currentBatch.landingRate ?? (currentBatch as any).landing_rate);
    const rawPtr = Number(currentBatch.ptr ?? (currentBatch as any).ptr);
    const rawPts = Number(currentBatch.pts ?? (currentBatch as any).pts);
    const rawPurchase = Number(currentBatch.purchaseRate ?? (currentBatch as any).purchase_rate);

    let costRate = 0;
    if (saleType === 'WHOLESALE') {
        costRate = (!isNaN(rawPurchase) && rawPurchase > 0)
            ? rawPurchase
            : ((!isNaN(rawPts) && rawPts > 0)
                ? rawPts
                : ((!isNaN(rawLanding) && rawLanding > 0)
                    ? rawLanding
                    : ((!isNaN(rawPtr) && rawPtr > 0) ? rawPtr : 0)));
    } else {
        costRate = (!isNaN(rawLanding) && rawLanding > 0)
            ? rawLanding
            : ((!isNaN(rawPtr) && rawPtr > 0)
                ? rawPtr
                : ((!isNaN(rawPurchase) && rawPurchase > 0) ? rawPurchase : 0));
    }
    const totalCost = costRate * tQtyFractional;
    
    // Net unit selling price using unified formula: (Final Row Amount / Quantity)
    const netUnitSellingPrice = tQtyFractional > 0 ? (sellAmount / tQtyFractional) : 0;
    const isNegativeMargin = costRate > 0 && tQtyFractional > 0 && (netUnitSellingPrice < (costRate - 0.005));
    
    const marginAmount = sellAmount - totalCost;
    const marginPct = sellAmount > 0 ? (marginAmount / sellAmount) * 100 : 0;

    const isLowMargin = marginPct < 10 && marginPct >= 0 && !isNegativeMargin;
    const exceedsStock = tQtyLoose > (currentBatch.qtyStrips * currentBatch.packSize + currentBatch.qtyLoose);
    const isDiscountInvalid = discountType === 'percentage' 
        ? (dVal < 0 || dVal > 100) 
        : (dVal < 0 || dVal > rawTotal);
    const isQtyZero = tQtyFractional === 0;

    const isValid = !isDiscountInvalid && !isQtyZero && !isNegativeMargin;

    const roundedSellAmount = bankersRound(sellAmount);
    return {
        tQtyFractional,
        tQtyLoose,
        rate: bankersRound(rate),
        sellAmount: roundedSellAmount,
        totalAmount: roundedSellAmount,
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
