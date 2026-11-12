/**
 * Numbers and wording for the product detail page, as pure functions (no React), so they are testable.
 *
 * They use the same helpers as the Inventory list (`batchValue`, `reorderLevel`, `expiryTone`), so a
 * product shows the same stock, value and expiry on both pages. This page used to do its own sums:
 * it ignored loose units in every value, used landing rate while labelling it "purchase rate", called
 * a product low only when below a minimum that is 0 (never) for products without one, and treated a
 * batch expiring today as already expired.
 */
import { daysUntil } from '@/lib/dates';
import { batchValue, pluralize, reorderLevel } from '@/lib/inventory';

export interface DetailBatch {
    id: string;
    batchNo: string;
    expiryDate: string;
    mfgDate?: string | null;
    qtyStrips: number;
    qtyLoose: number;
    packSize?: number | null;
    mrp: number;
    purchaseRate: number;
    landingRate?: number | null;
    rackLocation?: string | null;
}

export interface DetailProduct {
    packSize?: number | null;
    packType?: string | null;
    packUnit?: string | null;
    minQty?: number | null;
    batches?: DetailBatch[];
}

export type BatchState = 'empty' | 'expired' | 'expiring' | 'ok';

export const hasStock = (b: Pick<DetailBatch, 'qtyStrips' | 'qtyLoose'>) => (b.qtyStrips || 0) > 0 || (b.qtyLoose || 0) > 0;

/** empty (nothing left) > expired (before today) > expiring (today up to 90 days) > ok. Expiring TODAY is still sellable. */
export function batchState(b: DetailBatch, now: Date = new Date()): BatchState {
    if (!hasStock(b)) return 'empty';
    const days = daysUntil(b.expiryDate, now);
    if (days < 0) return 'expired';
    if (days <= 90) return 'expiring';
    return 'ok';
}

export interface ProductMetrics {
    packs: number;          // strips + loose / the batch's pack size, summed
    totalStrips: number;
    totalLoose: number;
    inStockBatches: number;
    expiredBatches: number;
    expiringBatches: number;
    nearestExpiry: string | null;
    costValue: number;      // at landing rate, the figure the batch table shows per row
    mrpValue: number;
    averageMrp: number;     // per pack, weighted by stock
    isLow: boolean;
    level: number;
}

export function computeMetrics(product: DetailProduct, now: Date = new Date()): ProductMetrics {
    const batches = product.batches ?? [];
    const stocked = batches.filter(hasStock);
    const fallback = product.packSize || 1;

    const packs = stocked.reduce((s, b) => s + (b.qtyStrips || 0) + (b.qtyLoose || 0) / (b.packSize || fallback), 0);
    const costValue = stocked.reduce((s, b) => s + batchValue(b, 'LANDING', fallback), 0);
    const mrpValue = stocked.reduce((s, b) => s + batchValue(b, 'MRP', fallback), 0);
    const level = reorderLevel(product);

    const states = stocked.map((b) => batchState(b, now));
    const nearest = [...stocked].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]?.expiryDate ?? null;

    return {
        packs,
        totalStrips: stocked.reduce((s, b) => s + (b.qtyStrips || 0), 0),
        totalLoose: stocked.reduce((s, b) => s + (b.qtyLoose || 0), 0),
        inStockBatches: stocked.length,
        expiredBatches: states.filter((s) => s === 'expired').length,
        expiringBatches: states.filter((s) => s === 'expiring').length,
        nearestExpiry: nearest,
        costValue,
        mrpValue,
        averageMrp: packs > 0 ? mrpValue / packs : 0,
        isLow: packs < level,
        level,
    };
}

/** "10 tablets per strip", or "Sold whole (piece)" when there is nothing to split ("1 Piece/piece" was shown). */
export function describePack(p: Pick<DetailProduct, 'packSize' | 'packType' | 'packUnit'>): string {
    const size = p.packSize || 1;
    const type = (p.packType || 'pack').toLowerCase();
    const unit = (p.packUnit || 'unit').toLowerCase();
    if (size <= 1) return `Sold whole (${type})`;
    return `${size} ${pluralize(unit, size)} per ${type}`;
}
