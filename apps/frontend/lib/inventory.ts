/**
 * Inventory page rules as pure functions (no React), so they are easy to test.
 */
import { daysUntil } from '@/lib/dates';
import { allowsLoose } from '@/lib/packRules';

// ── Valuation ────────────────────────────────────────────────────────────────

export type ValuationMode = 'PURCHASE' | 'LANDING' | 'MRP';

export const VALUATION_LABELS: Record<ValuationMode, string> = {
    PURCHASE: 'Purchase',
    LANDING: 'Landing',
    MRP: 'MRP',
};

interface ValuedBatch {
    qtyStrips: number;
    qtyLoose: number;
    packSize?: number | null;
    purchaseRate: number;
    landingRate?: number | null;
    mrp: number;
}

/**
 * Value of one batch. Loose units are converted to a fraction of a pack with the BATCH's pack size:
 * that is what the stock maths and billing use. The table used the product's pack size, which gives
 * a different (wrong) value whenever a batch's pack differs from the product's.
 */
export function batchValue(batch: ValuedBatch, mode: ValuationMode, fallbackPackSize = 1): number {
    const size = batch.packSize || fallbackPackSize || 1;
    const packs = (batch.qtyStrips || 0) + (batch.qtyLoose || 0) / size;
    const rate = mode === 'MRP' ? batch.mrp : mode === 'LANDING' ? batch.landingRate || batch.purchaseRate : batch.purchaseRate;
    return packs * (rate || 0);
}

export function productValue(batches: ValuedBatch[] | undefined, mode: ValuationMode, productPackSize = 1): number {
    return (batches ?? []).reduce((sum, b) => sum + batchValue(b, mode, productPackSize), 0);
}

// ── Expiry ───────────────────────────────────────────────────────────────────

/** The API answers "no stock with an expiry" with this date instead of null. */
export const NO_EXPIRY = '2099-12-31';
export const hasExpiry = (value?: string | null): value is string => !!value && !value.startsWith('2099-12-31');

export function expiryText(days: number): string {
    if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
    if (days === 0) return 'Expires today';
    return `${days} day${days === 1 ? '' : 's'} left`;
}

export { daysUntil };

// ── Wording ──────────────────────────────────────────────────────────────────

const IRREGULAR: Record<string, string> = { box: 'boxes', strip: 'strips', sachet: 'sachets' };

/** "box" -> "boxes" (the old code appended "s": "boxs"). */
export function pluralize(word: string, count = 2): string {
    const w = (word || '').trim();
    if (!w) return count === 1 ? 'unit' : 'units';
    if (count === 1) return w;
    const lower = w.toLowerCase();
    if (IRREGULAR[lower]) return IRREGULAR[lower];
    if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
    return `${w}s`;
}

// ── Stock adjustment ─────────────────────────────────────────────────────────

export type AdjustmentReason = 'damage' | 'theft' | 'correction' | 'return_from_patient';
export type AdjustmentDirection = 'add' | 'remove';
export type AdjustmentUnit = 'packs' | 'loose';

/** Damage and theft only ever remove stock, a patient return only adds; a correction can go either way. */
export function directionFor(reason: AdjustmentReason, chosen: AdjustmentDirection): AdjustmentDirection {
    if (reason === 'damage' || reason === 'theft') return 'remove';
    if (reason === 'return_from_patient') return 'add';
    return chosen;
}

interface StockedBatch {
    qtyStrips: number;
    qtyLoose: number;
    packSize?: number | null;
    packType?: string | null;
    allowsLoose?: boolean | null;
}

/** Can this batch be adjusted in loose units as well as whole packs? */
export const canAdjustLoose = (batch: StockedBatch) => allowsLoose(batch);

/**
 * What the batch will hold after the adjustment, or null if the server would refuse it.
 * Mirrors the endpoint: whole packs change only the pack count (never below 0); loose units may
 * break open a pack and fold whole packs back (inventory/views.py InventoryAdjustView).
 */
export function previewAdjustment(
    batch: StockedBatch,
    unit: AdjustmentUnit,
    direction: AdjustmentDirection,
    quantity: number,
): { strips: number; loose: number } | null {
    const size = Math.max(1, batch.packSize || 1);
    const q = Math.floor(Number(quantity) || 0);
    if (q <= 0) return { strips: batch.qtyStrips, loose: batch.qtyLoose };
    const signed = direction === 'remove' ? -q : q;

    if (unit === 'packs') {
        const strips = batch.qtyStrips + signed;
        return strips < 0 ? null : { strips, loose: batch.qtyLoose };
    }
    const totalUnits = batch.qtyStrips * size + batch.qtyLoose + signed;
    if (totalUnits < 0) return null;
    return { strips: Math.floor(totalUnits / size), loose: totalUnits % size };
}

export interface AdjustmentForm {
    adjustmentType: AdjustmentReason;
    direction: AdjustmentDirection;
    unit: AdjustmentUnit;
    quantity: number;
    reason: string;
    pin: string;
}

/**
 * The body POST /inventory/adjust/ needs. The modal used to send `adjustmentType`, `qtyStrips`,
 * `qtyLoose` and no PIN, while the endpoint requires `type`, `qty` and `pin`: every adjustment
 * from this screen failed with "batchId, type, qty, and pin are required".
 */
export function buildAdjustPayload(batchId: string, outletId: string, form: AdjustmentForm) {
    const direction = directionFor(form.adjustmentType, form.direction);
    const qty = Math.floor(Number(form.quantity) || 0);
    return {
        batchId,
        outletId,
        type: form.adjustmentType,
        qty: direction === 'remove' ? -qty : qty,
        adjustUnit: (form.unit === 'loose' ? 'loose' : 'strips') as 'loose' | 'strips',
        reason: form.reason.trim(),
        pin: form.pin,
    };
}

// ── Low stock ────────────────────────────────────────────────────────────────

/** Same default the server uses (inventory/views.py DEFAULT_MIN_QTY): packs below which a product is "low". */
export const DEFAULT_MIN_QTY = 10;

/** The outlet's own minimum when it set one (> 0), otherwise the default. `minQty` is 0, not null, when unset. */
export function reorderLevel(product: { minQty?: number | null }): number {
    return product.minQty && product.minQty > 0 ? product.minQty : DEFAULT_MIN_QTY;
}
