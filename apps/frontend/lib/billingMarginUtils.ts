import { CartItem } from '../types';

type SaleKind = 'RETAIL' | 'WHOLESALE';

/**
 * The least one pack of this line may sell for (before the GST adjustment).
 *
 * The SERVER decides it (`cost_floor_per_pack`, apps/billing/utils/pricing.py) and sends it with every batch as
 * `retailCostFloor` / `wholesaleCostFloor`; a cart line carries those two numbers and this function just reads them.
 *
 * The screen used to work the floor out again from landing / PTR / purchase rate, in four copies, from fields the cart
 * had already changed: a missing landing cost was filled with the purchase rate (so the PTR was never reached) and the
 * line editor cleared the PTR on retail lines. For such a batch the screen's floor was below the server's, the screen
 * gave the line more bill discount than allowed, and the bill was refused ("Security Block: Invalid Round Off").
 * The old derivation below is only for a line that has no server floor yet (a bill left open across the upgrade).
 */
export function costFloorOf(item: Partial<CartItem> | Record<string, unknown>, saleType: SaleKind = 'RETAIL'): number {
    const it = item as Record<string, unknown>;
    const sent = saleType === 'WHOLESALE' ? it.wholesaleCostFloor : it.retailCostFloor;
    if (sent !== undefined && sent !== null && sent !== '') {
        const floor = Number(sent);
        if (Number.isFinite(floor) && floor >= 0) return floor;
    }

    const rawLanding = Number(it.landingRate ?? it.landing_rate);
    const rawPtr = Number(it.ptr);
    const rawPts = Number(it.pts);
    const rawPurchase = Number(it.purchaseRate ?? it.purchase_rate);
    const first = (...values: number[]) => values.find((v) => !isNaN(v) && v > 0) ?? 0;
    return saleType === 'WHOLESALE' ? first(rawPurchase, rawPts, rawLanding, rawPtr) : first(rawLanding, rawPtr, rawPurchase);
}

/**
 * The two floors of a batch, to copy onto a cart line whenever the line takes (or changes) its batch.
 * Only the floors the batch really has are returned: spreading the result over a line can add or replace a floor,
 * never erase one (an editor that had no fresh batch data would otherwise wipe the floor the line already carried).
 */
export function floorsOf(batch: unknown): { retailCostFloor?: number; wholesaleCostFloor?: number } {
    const b = (batch ?? {}) as Record<string, unknown>;
    const floors: { retailCostFloor?: number; wholesaleCostFloor?: number } = {};
    for (const key of ['retailCostFloor', 'wholesaleCostFloor'] as const) {
        const v = b[key];
        if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) floors[key] = Number(v);
    }
    return floors;
}

/**
 * Money to the paisa, half upwards. Computer arithmetic is cleaned off first: 37.125 is held as 37.12499999999999 and
 * Rs 2156.50 as 2156.4999999999995, which rounded DOWN (a bill one rupee short of what the cashier works out).
 */
export const toPaise = (n: number) => Math.round(Number((n * 100).toFixed(6))) / 100;

/** Billed packs of a line: strips + loose / pack size, else totalQty. Free goods are not billed. */
export function billedQtyOf(item: Partial<CartItem>): number {
    const packSize = Number(item.packSize) > 0 ? Number(item.packSize) : 1;
    const strips = Number(item.qtyStrips || 0);
    const loose = Number(item.qtyLoose || 0);
    if (strips > 0 || loose > 0) return strips + loose / packSize;
    return Number(item.totalQty) > 0 ? Number(item.totalQty) : 0;
}

/**
 * What a line costs the customer BEFORE the bill discount (GST included). THE rule, in one place.
 *
 * `rate` is the price AFTER the line discount; `saleRate` the price before it; `discountPct` only says how big it was.
 * So the amount is rate x billed quantity, plus GST for wholesale (its rates are tax-exclusive). The server prices a line
 * the same way (billing/utils/item_amounts.py).
 *
 * The stored `item.totalAmount` is NOT read: quick-add wrote it without GST for wholesale, editing a saved bill wrote it
 * discounted twice, and re-adding a batch summed two different rates. The bill discount was then worked out on that.
 */
export function lineNetAmount(item: Partial<CartItem>, saleType: SaleKind = 'RETAIL'): number {
    const discPct = Number(item.discountPct || 0);
    const listPrice = Number(item.saleRate || 0)
        || (saleType === 'WHOLESALE' ? Number(item.pts || item.ptr || item.mrp || 0) : Number(item.mrp || 0));
    let rate = Number(item.rate || 0);
    if (!(rate > 0)) {
        if (discPct >= 100) return 0;
        rate = listPrice * (1 - discPct / 100);
    }
    if (!(rate > 0)) return toPaise(Number(item.totalAmount) || 0);      // no price on the line at all: nothing to work it out from
    const gstRate = Number(item.gstPct ?? item.gstRate ?? 0);
    return toPaise(rate * billedQtyOf(item) * (saleType === 'WHOLESALE' ? 1 + gstRate / 100 : 1));
}

/**
 * The price before the line discount of a line that was saved with only its net rate and discount %.
 * The batch's list price when it explains the rate (so 33.33% off 100 comes back as 100, not 99.99), else worked back.
 */
export function listPriceBeforeDiscount(netRate: number, discountPct: number, listPrice: number): number {
    if (!(discountPct > 0)) return netRate > 0 ? netRate : listPrice;
    if (discountPct >= 100 || !(netRate > 0)) return listPrice;
    if (listPrice > 0 && Math.abs(listPrice * (1 - discountPct / 100) - netRate) <= 0.011) return listPrice;
    return toPaise(netRate / (1 - discountPct / 100));
}

/**
 * The two prices of a line read back from a saved bill or quotation: `rate` (after the line discount) and `saleRate`
 * (before it). Retail quotations used to be stored with the MRP as their rate beside the discount %; such a rate is the
 * price BEFORE the discount (a discounted price can never equal the MRP).
 */
export function savedLinePrices(
    { rate, discountPct, mrp, listPrice }: { rate: number; discountPct: number; mrp: number; listPrice: number },
): { rate: number; saleRate: number } {
    if (!(rate > 0)) return { rate: discountPct >= 100 ? 0 : listPrice * (1 - discountPct / 100), saleRate: listPrice };
    if (discountPct > 0 && mrp > 0 && Math.abs(rate - mrp) <= 0.005) return { rate: rate * (1 - discountPct / 100), saleRate: rate };
    return { rate, saleRate: listPriceBeforeDiscount(rate, discountPct, listPrice) };
}

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
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL',
    landingCostIncludeGst: boolean = false
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

        const costFloor = costFloorOf(item, saleType);   // the server's figure (see costFloorOf)

        const gstRate = Number(item.gstRate ?? item.gstPct ?? 0);
        const taxMultiplier = 1 + (gstRate / 100);

        // FIX: If cost floor already includes GST (toggle ON), do not multiply it again.
        const costTaxMultiplier = landingCostIncludeGst ? 1 : taxMultiplier;
        const lineCostFloor = costFloor > 0 ? toPaise(costFloor * costTaxMultiplier * effectiveQty) : 0;

        const baseAmount = lineNetAmount(item, saleType);

        totalBase = Math.round((totalBase + baseAmount) * 100) / 100;
        totalHeadroom = Math.round((totalHeadroom + Math.max(0, baseAmount - lineCostFloor)) * 100) / 100;
    }

    const maxDiscountPct = totalBase > 0 ? Math.round((totalHeadroom / totalBase) * 10000) / 100 : 0;
    return { maxDiscountAmount: totalHeadroom, totalBaseAmount: totalBase, maxDiscountPct };
}

export interface LineMarginInfo {
    margin: number;             // Margin per pack: sellingPricePerPack - costFloor (or itemProfit)
    marginPct: number;          // Margin %: (rowProfit / salesAmount) * 100
    lineGrossProfit: number;    // Line total profit: alias for rowProfit
    rowProfit: number;          // Row total profit based on apples-to-apples tax comparison
    itemProfit: number;         // Unit profit per pack: rowProfit / quantity
    rowTaxableAmount: number;   // Base price before tax
    rowTotalAmount: number;     // Final net payable including tax
    lineLandingCost: number;    // Line total landing cost: costFloor * effectivePackQty
    landingRate: number;        // Landing cost per pack
    costFloor: number;          // Cost floor per pack: item.ptr ?? landingRate ?? purchaseRate
    sellingPricePerPack: number;// Actual selling price per pack (apples-to-apples basis)
    finalRowAmount: number;     // Final row amount (after item and bill discount)
    isLossSale: boolean;        // true if unit selling price is strictly less than costFloor (rowProfit < 0)
    isBelowLandingCost: boolean;// true if rowProfit < 0 (checkout lock flag)
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
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL',
    landingCostIncludeGst: boolean = false
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

    // Cost floor: the server's figure (see costFloorOf)
    const rawLanding = Number(item.landingRate ?? (item as any).landing_rate);
    const costFloor = costFloorOf(item, saleType);

    const landingRate = (!isNaN(rawLanding) && rawLanding > 0)
        ? rawLanding
        : costFloor;

    const lineLandingCost = Math.round(costFloor * effectivePackQty * 100) / 100;

    // Base selling amount for this line (after item-level discount)
    const baseSellingAmount = effectivePackQty > 0 ? lineNetAmount(item, saleType) : 0;

    // Apply extra discount % (bill-level) proportionally
    const discountFactor = extraDiscountPct > 0 ? (1 - extraDiscountPct / 100) : 1;
    let finalRowAmount = Math.round(baseSellingAmount * discountFactor * 100) / 100;

    // Tax multiplier for apples-to-apples tax inclusivity comparison
    const gstRate = Number(item.gstRate ?? item.gstPct ?? 0);
    const taxMultiplier = 1 + (gstRate / 100);

    // FIX: If cost floor already includes GST (toggle ON), do not multiply it again.
    const costTaxMultiplier = landingCostIncludeGst ? 1 : taxMultiplier;
    const lineCostFloorInclusive = Math.round(costFloor * costTaxMultiplier * effectivePackQty * 100) / 100;

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
            rowProfit: 0,
            itemProfit: 0,
            rowTaxableAmount: 0,
            rowTotalAmount: 0,
            lineLandingCost: 0,
            landingRate,
            costFloor,
            sellingPricePerPack: 0,
            finalRowAmount: 0,
            isLossSale: false, // Safe harbor: promotional gift, not a loss sale
            isBelowLandingCost: false,
        };
    }
    // ── END Safe Harbor ───────────────────────────────────────────────────────

    // Smart Cap: If base amount is legal before bill discount, cap final row amount to cost floor.
    // IMPORTANT: GST (CGST/SGST) is derived STRICTLY AFTER this cap step using the
    // post-cap finalRowAmount, ensuring tax is never calculated on a discounted-below-floor amount.
    if (baseSellingAmount >= lineCostFloorInclusive && finalRowAmount < lineCostFloorInclusive) {
        finalRowAmount = lineCostFloorInclusive;
    }

    // Quantities & Core Values
    const quantity = effectivePackQty;
    const landingCost = costFloor;
    const totalCost = landingCost * quantity;
    const rowTotalAmount = finalRowAmount;
    const rowTaxableAmount = taxMultiplier > 0 ? (rowTotalAmount / taxMultiplier) : rowTotalAmount;

    // ── Conditional Apples-to-Apples Profit & Margin Calculation ──────────────
    let rowProfit = 0;
    let marginPct = 0;

    if (landingCostIncludeGst) {
        // 1. If landingCostIncludeGst is TRUE (Tax-Inclusive Comparison):
        // rowProfit = rowTotalAmount - (landingCost * quantity) (where rowTotalAmount is final net payable incl tax)
        rowProfit = Math.round((rowTotalAmount - totalCost) * 100) / 100;
        // marginPct = (rowProfit / rowTotalAmount) * 100 (safely handle division by zero)
        marginPct = rowTotalAmount > 0 
            ? Math.round(((rowProfit / rowTotalAmount) * 100) * 100) / 100 
            : 0;
    } else {
        // 2. If landingCostIncludeGst is FALSE (Tax-Exclusive Comparison):
        // rowProfit = rowTaxableAmount - (landingCost * quantity) (where rowTaxableAmount is base price before tax)
        rowProfit = Math.round((rowTaxableAmount - totalCost) * 100) / 100;
        // marginPct = (rowProfit / rowTaxableAmount) * 100 (safely handle division by zero)
        marginPct = rowTaxableAmount > 0 
            ? Math.round(((rowProfit / rowTaxableAmount) * 100) * 100) / 100 
            : 0;
    }

    const itemProfit = quantity > 0 ? Math.round((rowProfit / quantity) * 100) / 100 : 0;
    const margin = itemProfit;

    // ── Checkout Lock & Warning Flag ──────────────────────────────────────────
    // Strictly lock and flag if rowProfit < 0 (using -0.005 threshold to prevent floating-point rounding false alarms on break-even)
    const isBelowLandingCost = landingCost > 0 && quantity > 0 && (rowProfit < -0.005);
    const isLossSale = isBelowLandingCost;

    // Selling price per pack: apples-to-apples basis corresponding to landingCost
    const sellingPricePerPack = quantity > 0 
        ? Math.round((landingCostIncludeGst ? (rowTotalAmount / quantity) : (rowTaxableAmount / quantity)) * 100) / 100
        : Number(item.rate || item.saleRate || 0);

    return {
        margin,
        marginPct,
        lineGrossProfit: rowProfit,
        lineLandingCost: Math.round(totalCost * 100) / 100,
        landingRate,
        costFloor: landingCost,
        sellingPricePerPack,
        finalRowAmount: rowTotalAmount,
        isLossSale,
        rowProfit,
        itemProfit,
        rowTaxableAmount: Math.round(rowTaxableAmount * 100) / 100,
        rowTotalAmount: Math.round(rowTotalAmount * 100) / 100,
        isBelowLandingCost,
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
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL',
    landingCostIncludeGst: boolean = false
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

        const costFloor = costFloorOf(item, saleType);   // the server's figure (see costFloorOf)

        const gstRate = Number(item.gstRate ?? item.gstPct ?? 0);
        const taxMultiplier = 1 + (gstRate / 100);

        // FIX: If cost floor already includes GST (toggle ON), do not multiply it again.
        const costTaxMultiplier = landingCostIncludeGst ? 1 : taxMultiplier;
        const lineCostFloor = toPaise(costFloor * costTaxMultiplier * effectiveQty);

        const baseAmount = lineNetAmount(item, saleType);

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

    const targetBillDiscount = toPaise(totalBaseAmount * (extraDiscountPct / 100));

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

    // The last paise: a share smaller than half a paisa rounds to nothing in the passes above, so Rs 100 over three equal
    // lines gave 33.33 three times and the cashier saw Rs 99.99. Whatever is left goes to the lines with the most room.
    let paiseLeft = Math.round(remainingToDistribute * 100);
    for (const it of [...items].sort((a, b) => (b.headroom - b.discount) - (a.headroom - a.discount))) {
        if (paiseLeft <= 0) break;
        const add = Math.min(paiseLeft, Math.round((it.headroom - it.discount) * 100));
        if (add <= 0) continue;
        it.discount = Math.round((it.discount * 100) + add) / 100;
        paiseLeft -= add;
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
    saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL',
    landingCostIncludeGst: boolean = false
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

    const smartAllocations = distributeSmartDiscounts(cart, extraDiscountPct, saleType, landingCostIncludeGst);

    let totalLandingCost = 0;
    let itemsSellingTotal = 0;
    let itemsGrossProfit = 0;
    let hasLossSale = false;

    for (let idx = 0; idx < cart.length; idx++) {
        const item = cart[idx];
        const key = item.batchId || `item-${idx}`;
        const alloc = smartAllocations.get(key);

        const line = calculateLineMargin(item, extraDiscountPct, saleType, landingCostIncludeGst);
        totalLandingCost += line.lineLandingCost;

        const rowAmount = alloc ? alloc.finalRowAmount : line.finalRowAmount;
        const rowLoss = alloc ? alloc.isLossSale : line.isLossSale;

        itemsSellingTotal += rowAmount;
        itemsGrossProfit += line.rowProfit;
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
