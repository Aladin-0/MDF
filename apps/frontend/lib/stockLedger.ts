/**
 * Stock Ledger: types, labels and the small pure helpers the page needs.
 * No React in here, so it is easy to test and to reuse.
 */
import { parseDay, toDayString } from '@/lib/dates';

// the day helpers live in lib/dates.ts (Inventory uses them too); re-exported so imports keep working
export { parseDay, toDayString, formatDay, formatMonth, expiryTone, daysUntil, type ExpiryTone } from '@/lib/dates';

export interface LedgerEntry {
    id: string;
    batch_id: string;
    product_id: string;
    txn_date: string;
    txn_type: string;
    txn_type_label: string;
    voucher_type: string;
    voucher_number: string;
    party_name: string;
    product_name: string;
    batch_number: string;
    expiry_date: string | null;
    qty_in: number;
    qty_out: number;
    rate: number;
    pack_size: number;
    value_in: number;
    value_out: number;
    running_qty: number;
    running_value: number;
    created_at: string;
}

export interface BatchSummaryItem {
    batch_id: string;
    batch_number: string;
    product_name: string;
    qty_remaining: number;
    pack_size: number;
    expiry_date: string | null;
}

export interface LedgerSummary {
    total_in: number;
    total_out: number;
    total_value_in: number;
    total_value_out: number;
}

export interface LedgerPage {
    entries: LedgerEntry[];
    summary: LedgerSummary;
    totalRecords: number;
    totalPages: number;
}

export const EMPTY_SUMMARY: LedgerSummary = { total_in: 0, total_out: 0, total_value_in: 0, total_value_out: 0 };

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** A batch with this many packs (or fewer) left is flagged "Low". */
export const LOW_STOCK_PACKS = 2;

// ── Transaction types ────────────────────────────────────────────────────────

export type TxnTone = 'in' | 'out' | 'return' | 'adjust' | 'neutral';

export const TXN_TYPES: { value: string; label: string; tone: TxnTone }[] = [
    { value: 'PURCHASE_IN', label: 'Purchase In', tone: 'in' },
    { value: 'SALE_OUT', label: 'Sale Out', tone: 'out' },
    { value: 'SALE_RETURN', label: 'Sale Return', tone: 'return' },
    { value: 'PURCHASE_RETURN', label: 'Purchase Return', tone: 'return' },
    { value: 'ADJUSTMENT_IN', label: 'Adjustment In', tone: 'adjust' },
    { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out', tone: 'adjust' },
    { value: 'OPENING', label: 'Opening Stock', tone: 'neutral' },
];

/** Tailwind classes per tone: status colours (green in, red out...), not brand colours. */
export const TONE_CLASSES: Record<TxnTone, { badge: string; dot: string }> = {
    in:      { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
    out:     { badge: 'border-rose-200 bg-rose-50 text-rose-800',          dot: 'bg-rose-500' },
    return:  { badge: 'border-sky-200 bg-sky-50 text-sky-800',             dot: 'bg-sky-500' },
    adjust:  { badge: 'border-amber-200 bg-amber-50 text-amber-800',       dot: 'bg-amber-500' },
    neutral: { badge: 'border-border bg-muted text-muted-foreground',      dot: 'bg-muted-foreground/60' },
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

/** Both dates present and from <= to (the strings are ISO, so they compare correctly). */
export function isRangeValid(from: string, to: string): boolean {
    return !!from && !!to && from <= to;
}

// ── URL state ────────────────────────────────────────────────────────────────

export interface LedgerFilters {
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
