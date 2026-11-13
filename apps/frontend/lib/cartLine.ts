/**
 * Turning "this product, this batch, this much" into a bill line.
 *
 * This is the maths the billing screen used to do inline in MainInvoiceWorkspace's "add" button. It lives here so the desktop quick-add and
 * the phone Add sheet build a line the same way (same rate, same loose rule, same GST split, same stock block). Totals for the whole bill are
 * still computed by the store (`getDraftTotals`); this only builds one line.
 */
import type { Batch, CartItem, ProductSearchResult } from '@/types';
import { allowsLoose } from '@/lib/packRules';

export const STOCK_BLOCK_MESSAGE = 'BLOCKED: Added quantity exceeds available stock.';

export type SaleType = 'RETAIL' | 'WHOLESALE';

/** The rate a line starts at: retail = MRP; wholesale = PTS, else PTR, else MRP. */
export function defaultRateFor(batch: Pick<Batch, 'mrp' | 'ptr' | 'pts'>, saleType: SaleType): number {
    return saleType === 'WHOLESALE' ? (batch.pts || batch.ptr || batch.mrp) : batch.mrp;
}

/** Units on the shelf in this batch, in loose units (strips x pack size + loose). */
export function batchStockUnits(batch: Pick<Batch, 'qtyStrips' | 'qtyLoose' | 'packSize'>): number {
    return batch.qtyStrips * batch.packSize + batch.qtyLoose;
}

export type QuickAddResult =
    | { ok: true; item: CartItem }
    | { ok: false; reason: 'no_qty' }
    | { ok: false; reason: 'exceeds_stock'; message: string };

interface QuickAddInput {
    product: ProductSearchResult;
    batch: Batch;
    /** What was typed: strips (whole packs) and loose units, as text from the inputs */
    qtyStrips: string | number;
    qtyLoose: string | number;
    discountPct: string | number;
    saleType: SaleType;
}

/**
 * Validate a quick-add and build the cart line. `no_qty` = nothing entered; `exceeds_stock` = more than the batch holds (a hard block).
 * Loose units only count when the pack allows loose selling (the server's rule, `allowsLoose`).
 */
export function quickAddLine({ product, batch, qtyStrips, qtyLoose, discountPct, saleType }: QuickAddInput): QuickAddResult {
    const s = parseInt(String(qtyStrips)) || 0;
    const l = parseInt(String(qtyLoose)) || 0;
    if (s === 0 && l === 0) return { ok: false, reason: 'no_qty' };

    const effectiveLoose = allowsLoose(batch) ? l : 0;
    const totalQtyLoose = (s * batch.packSize) + effectiveLoose;
    const totalQtyFractional = s + (effectiveLoose / batch.packSize);

    if (totalQtyLoose > batchStockUnits(batch)) return { ok: false, reason: 'exceeds_stock', message: STOCK_BLOCK_MESSAGE };

    const dPct = parseFloat(String(discountPct)) || 0;
    const defaultRate = defaultRateFor(batch, saleType);
    const discountedRate = defaultRate * (1 - (dPct / 100));

    const taxableAmount = (discountedRate * totalQtyFractional) / (1 + product.gstRate / 100);
    const gstAmount = (discountedRate * totalQtyFractional) - taxableAmount;

    const item = {
        batchId: batch.id,
        productId: product.id,
        name: product.name,
        composition: product.composition,
        manufacturer: product.manufacturer,
        packSize: batch.packSize,
        packUnit: batch.packUnit || product.packUnit || 'units',
        packType: batch.packType || product.packType || '',
        requiresPrescription: ['H', 'H1', 'X', 'Narcotic'].includes(product.scheduleType),
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        scheduleType: product.scheduleType as any,
        hsn: product.hsnCode || '',
        mrp: batch.mrp,
        ptr: batch.ptr || 0,
        pts: batch.pts || 0,
        saleRate: defaultRate,          // the price BEFORE the line discount (the line editor starts from this)
        rate: discountedRate,           // the price AFTER it: the bill total, the payload and the server all read `rate` as the net price
        qtyStrips: s,
        qtyLoose: effectiveLoose,

        totalQty: totalQtyFractional,
        saleMode: 'strip',
        discountPct: dPct,
        gstRate: product.gstRate,
        taxableAmount,
        gstAmount,
        totalAmount: discountedRate * totalQtyFractional,
        purchaseRate: batch.purchaseRate,
        landingRate: batch.landingRate ?? batch.purchaseRate,
    } as CartItem;

    return { ok: true, item };
}
