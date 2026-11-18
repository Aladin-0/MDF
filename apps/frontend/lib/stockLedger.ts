/**
 * Stock Ledger: types, labels and the small pure helpers the page needs.
 * No React in here, so it is easy to test and to reuse.
 */
import { parseDay, toDayString } from '@/lib/dates';
import { formatQty } from '@/lib/utils';

// the day helpers live in lib/dates.ts (Inventory uses them too); re-exported so imports keep working
export { parseDay, toDayString, formatDay, formatMonth, expiryTone, daysUntil, type ExpiryTone } from '@/lib/dates';

export type LedgerEvent = 'opening' | 'received' | 'sold' | 'customer_return' | 'supplier_return' | 'added' | 'written_off' | 'bookkeeping' | 'other';

export interface PackInfo { pack_size: number; pack_type: string; pack_unit: string }

export interface LedgerEntry extends PackInfo {
    id: string;
    batch_id: string;
    product_id: string;
    txn_date: string;
    txn_type: string;
    /** the event in plain words ("Sold", "Written off: Expired"), worked out on the server */
    txn_type_label: string;
    event: LedgerEvent;
    event_label: string;
    /** reason, invoice... */
    detail: string;
    /** the customer or supplier */
    counterparty: string;
    voucher_type: string;
    voucher_number: string;
    party_name: string;
    product_name: string;
    batch_number: string;
    expiry_date: string | null;
    qty_in: number;
    qty_out: number;
    /** signed, in packs */
    qty: number;
    running_qty: number;
    balance_negative: boolean;
    /** null for people without purchase-rate access */
    rate: number | null;
    value_in: number | null;
    value_out: number | null;
    running_value: number | null;
    created_at: string;
    /** the invoice (or return) this row came from; null for opening stock, adjustments and repairs */
    source?: LedgerSource | null;
}

/** The document a row came from, so it can be opened. `id` is the INVOICE id for a sale or a purchase. */
export interface LedgerSource { kind: 'sale' | 'purchase' | 'sale_return' | 'debit_note'; id: string }
export type InvoiceRef = { kind: 'sale' | 'purchase'; id: string };
/** Only sales and purchases have a preview here. */
export const asInvoiceRef = (s: LedgerSource | null | undefined): InvoiceRef | null => (s && (s.kind === 'sale' || s.kind === 'purchase') ? { kind: s.kind, id: s.id } : null);

export type BatchState = 'sold_out' | 'expired' | 'expiring' | 'ok';
export type LedgerState = 'OK' | 'A' | 'B' | 'B2' | 'C' | 'R';

export interface SupplierInfo { distributor_id: string; distributor_name: string; invoice_id: string | null; invoice_no: string; invoice_date: string | null; more_suppliers: boolean; /** said by a person, not proved by a purchase invoice */ assigned?: boolean }

export interface BatchCard extends PackInfo {
    id: string;
    batch_number: string;
    product_id: string | null;
    product_name: string;
    manufacturer: string;
    expiry_date: string;
    days_to_expiry: number;
    qty_strips: number;
    qty_loose: number;
    qty_units: number;
    qty_packs: number;
    mrp: number;
    rack_location: string;
    state: BatchState;
    purchase_rate?: number;
    supplier?: SupplierInfo | null;
    ledger_state?: LedgerState;
    ledger_state_label?: string;
}

export interface ProductHit { id: string; name: string; manufacturer: string; batch_count: number; stocked_batches: number; batches: BatchCard[] }

export interface LedgerSummary {
    total_in: number;
    total_out: number;
    received: number;
    sold: number;
    customer_returns: number;
    written_off: number;
    supplier_returns: number;
    added: number;
    total_value_in: number | null;
    total_value_out: number | null;
}

export interface LedgerPage {
    entries: LedgerEntry[];
    summary: LedgerSummary;
    batch: BatchCard | null;
    totalRecords: number;
    totalPages: number;
}

export interface TraceSale { invoice_id: string; invoice_no: string; date: string; customer: string; customer_phone: string; patient: string; qty_packs: number; returned_packs: number; pack_size: number }
export interface TracePurchase { invoice_id: string; invoice_no: string; date: string; distributor: string; qty_packs: number; purchase_rate?: number }
export interface BatchTrace {
    batch: BatchCard;
    purchases: TracePurchase[];
    sales: TraceSale[];
    salesTruncated: boolean;
    salesCount: number;
    totals: { purchased_packs: number; sold_packs: number; left_packs: number };
}

export interface LedgerHealth {
    counts: Record<LedgerState, number>;
    labels: Record<LedgerState, string>;
    safeToRepair: number;
    needsDecision: number;
    openingStockIfBookedAsOpening: number;
    canRepair: boolean;
}

export const EMPTY_SUMMARY: LedgerSummary = { total_in: 0, total_out: 0, received: 0, sold: 0, customer_returns: 0, written_off: 0, supplier_returns: 0, added: 0, total_value_in: null, total_value_out: null };

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

// ── Transaction types ────────────────────────────────────────────────────────

export type TxnTone = 'in' | 'out' | 'return' | 'adjust' | 'neutral';

export const TXN_TYPES: { value: string; label: string; tone: TxnTone }[] = [
    { value: 'PURCHASE_IN', label: 'Received from a supplier', tone: 'in' },
    { value: 'SALE_OUT', label: 'Sold', tone: 'out' },
    { value: 'SALE_RETURN', label: 'Customer returns', tone: 'return' },
    { value: 'PURCHASE_RETURN', label: 'Returned to a supplier', tone: 'return' },
    { value: 'ADJUSTMENT_IN', label: 'Stock added', tone: 'adjust' },
    { value: 'ADJUSTMENT_OUT', label: 'Written off or removed', tone: 'adjust' },
    { value: 'OPENING', label: 'Opening stock', tone: 'neutral' },
];

/** Tailwind classes per tone: status colours (green in, red out...), not brand colours. */
export const TONE_CLASSES: Record<TxnTone, { badge: string; dot: string }> = {
    in:      { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
    out:     { badge: 'border-rose-200 bg-rose-50 text-rose-800',          dot: 'bg-rose-500' },
    return:  { badge: 'border-sky-200 bg-sky-50 text-sky-800',             dot: 'bg-sky-500' },
    adjust:  { badge: 'border-amber-200 bg-amber-50 text-amber-800',       dot: 'bg-amber-500' },
    neutral: { badge: 'border-border bg-muted text-muted-foreground',      dot: 'bg-muted-foreground/60' },
};

export const EVENT_TONE: Record<LedgerEvent, TxnTone> = {
    opening: 'neutral', received: 'in', sold: 'out', customer_return: 'return', supplier_return: 'return',
    added: 'in', written_off: 'adjust', bookkeeping: 'neutral', other: 'neutral',
};

export function toneForTxn(type: string): TxnTone {
    return TXN_TYPES.find((t) => t.value === type)?.tone ?? 'neutral';
}

// ── Formatting (Intl, never hand-built strings) ──────────────────────────────

const LOCALE = 'en-IN';
const inr = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export const formatInr = (n: number) => inr.format(Number.isFinite(n) ? n : 0);
export const formatQtyNumber = (n: number) => plain.format(Number.isFinite(n) ? n : 0);
export const formatCount = (n: number) => whole.format(Number.isFinite(n) ? n : 0);


/**
 * Packs (can be fractional: 0.4 of a strip of 10 = 4 tablets) in the BATCH's own words: "3 strips + 4 tablets", "2 bottles",
 * "50 ml". It used to say "strip" / "tablet" for everything (shared `formatDecimalQty`), so a 300 GM product showed "1 tablet".
 */
export function packsText(packs: number, p: PackInfo): string {
    const size = p.pack_size > 0 ? p.pack_size : 1;
    const units = Math.round(Math.abs(packs) * size);
    if (units === 0) return '0';
    // lower-cased: stored values vary ('Tablet', 'tablet') and a sentence should not shout "Tablets"
    return formatQty(Math.floor(units / size), units % size, size, p.pack_type?.toLowerCase() || undefined, p.pack_unit?.toLowerCase() || undefined);
}

/** "+2 strips" / "−1 tablet": the sign is shown, the words are the batch's. */
export function signedPacksText(packs: number, p: PackInfo): string {
    const text = packsText(packs, p);
    return text === '0' ? '0' : `${packs < 0 ? '−' : '+'}${text}`;
}

/** "Expired 3 days ago" / "Expires today" / "12 days left" (an expired batch is said in words, not only in colour). */
export function expiryDayText(days: number): string {
    if (days < 0) return `expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
    if (days === 0) return 'expires today';
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export function formatTime(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}

// ── Date range ───────────────────────────────────────────────────────────────

/** Last month up to today, computed on the client only (never during server render). */
export function defaultRange(now: Date = new Date()): { from: string; to: string } {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { from: toDayString(start), to: toDayString(now) };
}

/** The last `days` days up to today (0 = today only), from local date parts. */
export function rangeEndingToday(days: number, now: Date = new Date()): { from: string; to: string } {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    return { from: toDayString(start), to: toDayString(now) };
}

/** Both dates present and from <= to (the strings are ISO, so they compare correctly). */
export function isRangeValid(from: string, to: string): boolean {
    return !!from && !!to && from <= to;
}

// ── URL state ────────────────────────────────────────────────────────────────

export interface LedgerFilters {
    /** the product being looked at (its batches show as cards); a batch picked from it narrows further */
    product: string | null;
    batch: string | null;
    type: string;
    q: string;
    from: string;
    to: string;
    page: number;
    size: number;
}

export function readFilters(params: URLSearchParams): LedgerFilters {
    const size = Number(params.get('size'));
    return {
        product: params.get('product') || null,
        batch: params.get('batch') || null,
        type: params.get('type') ?? '',
        q: params.get('q') ?? '',
        from: params.get('from') ?? '',
        to: params.get('to') ?? '',
        page: Math.max(1, Math.floor(Number(params.get('page'))) || 1),
        size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    };
}

/**
 * Apply a change to the URL's query string. Anything that changes WHAT is listed (batch, type,
 * search, dates, page size) sends you back to page 1 in the same update. Before, that was a
 * separate effect, so the list was fetched once with the new filter and the old page and then
 * again on page 1.
 */
export function applyFilterPatch(current: URLSearchParams, patch: Partial<LedgerFilters>): URLSearchParams {
    const next = new URLSearchParams(current.toString());
    const set = (key: string, value: string | number | null | undefined, fallback: string | number = '') => {
        if (value === null || value === undefined || value === '' || value === fallback) next.delete(key);
        else next.set(key, String(value));
    };
    if ('product' in patch) set('product', patch.product);
    if ('batch' in patch) set('batch', patch.batch);
    if ('type' in patch) set('type', patch.type);
    if ('q' in patch) set('q', patch.q?.trim());
    if ('from' in patch) set('from', patch.from);
    if ('to' in patch) set('to', patch.to);
    if ('size' in patch) set('size', patch.size, DEFAULT_PAGE_SIZE);
    if ('page' in patch) set('page', patch.page, 1);
    else if (Object.keys(patch).some((k) => k !== 'page')) next.delete('page');
    return next;
}
