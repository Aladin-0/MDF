/**
 * Expiry Manager (`/dashboard/inventory/expiry`): the rules of the screen as pure functions (no React), so they are
 * easy to test and the page only composes them. The server (`apps/inventory/expiry.py`) does the filtering, totals
 * and the write-off; this file builds what to ask for and what to show.
 *
 * Dates here are built from LOCAL parts (`ymd`), never `toISOString()`: that gives yesterday before 05:30 in India.
 * "Expired" means `daysToExpiry < 0`; a batch expiring TODAY is still sellable (docs/INVENTORY.md).
 */
import { formatQty } from '@/lib/utils';

export interface ExpiryRow {
    id: string;
    productId: string | null;
    productName: string;
    manufacturer: string;
    batchNo: string;
    expiryDate: string;
    daysToExpiry: number;
    qtyStrips: number;
    qtyLoose: number;
    packSize: number;
    packType: string;
    packUnit: string;
    packs: number;
    mrp: number;
    mrpValue: number;
    rackLocation: string;
    distributorId: string | null;
    distributorName: string;
    moreSuppliers: boolean;
    /** known from an assignment, not from a purchase invoice: it cannot be returned by invoice */
    supplierAssigned: boolean;
    purchaseInvoiceId: string | null;
    purchaseInvoiceNo: string;
    /** only for people allowed to see purchase rates */
    purchaseRate?: number;
    landingRate?: number | null;
    costValue?: number;
}

export interface ExpiryTotals { batches: number; products: number; expiredBatches: number; mrpValue: number; distributors: number; costValue?: number }
export interface ExpiryGroup { distributorId: string | null; name: string; batches: number; mrpValue: number; costValue?: number }
export interface ExpiryResponse {
    data: ExpiryRow[];
    totals: ExpiryTotals;
    groups: ExpiryGroup[];
    pagination: { page: number; pageSize: number; total: number; pages: number };
    matchingIds?: string[];
    idsTruncated?: boolean;
}

// ───────────────────────────── dates ─────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (key: string, n: number): string => {
    const [y, m] = key.split('-').map(Number);
    const t = new Date(y, m - 1 + n, 1);
    return monthKey(t);
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = MONTHS;
export const monthLabel = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const isMonthKey = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ───────────────────────────── filters (kept in the URL) ─────────────────────────────

export const PRESETS = [
    { key: 'expired', label: 'Expired' },
    { key: 'this-month', label: 'This month' },
    { key: 'next-month', label: 'Next month' },
    { key: '30', label: '30 days' },
    { key: '60', label: '60 days' },
    { key: '90', label: '90 days' },
    { key: '180', label: '180 days' },
] as const;
export type PresetKey = (typeof PRESETS)[number]['key'];
export type WindowKind = PresetKey | 'months' | 'custom';
export const SORTS = ['expiry', 'distributor', 'product', 'value'] as const;
export type SortKey = (typeof SORTS)[number];
export const UNKNOWN_DISTRIBUTOR = 'none';
export const PAGE_SIZES = [25, 50, 100] as const;

export interface ExpiryFilters {
    w: WindowKind;
    months: string[];
    from: string;
    to: string;
    includeExpired: boolean;
    distributors: string[];       // distributor ids, and 'none' for "no purchase record"
    q: string;
    sort: SortKey;
    group: boolean;
    page: number;
    size: number;
}

/** "Next N days" also lists what is already expired (it needs action too); a month or a date range is exactly what was asked for. */
export const defaultIncludeExpired = (w: WindowKind) => Number(w) > 0;

export const DEFAULT_FILTERS: ExpiryFilters = { w: '90', months: [], from: '', to: '', includeExpired: true, distributors: [], q: '', sort: 'expiry', group: false, page: 1, size: 50 };

export function readExpiryParams(sp: URLSearchParams): ExpiryFilters {
    const w = sp.get('w') as WindowKind;
    const valid = w === 'months' || w === 'custom' || PRESETS.some((p) => p.key === w);
    const sort = sp.get('sort') as SortKey;
    const size = Number(sp.get('size'));
    return {
        w: valid ? w : DEFAULT_FILTERS.w,
        months: (sp.get('m') ?? '').split(',').filter(isMonthKey).sort(),
        from: isDay(sp.get('from') ?? '') ? sp.get('from')! : '',
        to: isDay(sp.get('to') ?? '') ? sp.get('to')! : '',
        includeExpired: sp.get('exp') === null ? defaultIncludeExpired(valid ? w : DEFAULT_FILTERS.w) : sp.get('exp') === '1',
        distributors: (sp.get('dist') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        q: sp.get('q') ?? '',
        sort: (SORTS as readonly string[]).includes(sort) ? sort : 'expiry',
        group: sp.get('group') === '1',
        page: Math.max(1, Math.floor(Number(sp.get('page'))) || 1),
        size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_FILTERS.size,
    };
}

/** Put a change into the URL's params. Anything that changes WHICH rows match goes back to page 1. */
export function applyExpiryPatch(current: URLSearchParams, patch: Partial<ExpiryFilters>): URLSearchParams {
    const next = new URLSearchParams(current);
    const set = (k: string, v: string | null) => { if (v === null || v === '') next.delete(k); else next.set(k, v); };
    if ('w' in patch) set('w', patch.w === DEFAULT_FILTERS.w ? null : patch.w!);
    if ('w' in patch && !('includeExpired' in patch)) next.delete('exp');       // a new window starts from that window's own default
    if ('months' in patch) set('m', (patch.months ?? []).join(','));
    if ('from' in patch) set('from', patch.from ?? '');
    if ('to' in patch) set('to', patch.to ?? '');
    if ('includeExpired' in patch) set('exp', patch.includeExpired ? '1' : '0');
    if ('distributors' in patch) set('dist', (patch.distributors ?? []).join(','));
    if ('q' in patch) set('q', patch.q ?? '');
    if ('sort' in patch) set('sort', patch.sort === 'expiry' ? null : patch.sort!);
    if ('group' in patch) set('group', patch.group ? '1' : null);
    if ('size' in patch) set('size', patch.size === DEFAULT_FILTERS.size ? null : String(patch.size));
    if ('page' in patch) set('page', patch.page && patch.page > 1 ? String(patch.page) : null);
    else if (Object.keys(patch).some((k) => k !== 'page' && k !== 'size')) next.delete('page');
    return next;
}

/** What to ask the server for. */
export function serverParams(f: ExpiryFilters, today: Date = new Date()): Record<string, string> {
    const p: Record<string, string> = { sort: f.sort };
    if (f.q.trim()) p.q = f.q.trim();
    if (f.distributors.length) p.distributorIds = f.distributors.join(',');
    const days = Number(f.w);
    if (f.w === 'expired') {
        p.to = ymd(addDays(today, -1));                      // everything before today
    } else if (f.w === 'this-month') {
        p.months = monthKey(today);
        if (f.includeExpired) p.includeExpired = 'true';
    } else if (f.w === 'next-month') {
        p.months = addMonths(monthKey(today), 1);
        if (f.includeExpired) p.includeExpired = 'true';
    } else if (f.w === 'months') {
        if (f.months.length) p.months = f.months.join(',');
        if (f.includeExpired) p.includeExpired = 'true';
    } else if (f.w === 'custom') {
        if (f.from) p.from = f.from;
        if (f.to) p.to = f.to;
        if (f.includeExpired) p.includeExpired = 'true';
    } else if (days > 0) {
        p.from = ymd(today);
        p.to = ymd(addDays(today, days));
        if (f.includeExpired) p.includeExpired = 'true';
    }
    return p;
}

/** Can the filters be sent? A months / custom window with nothing chosen yet would silently mean "the default 90 days". */
export function isAskable(f: ExpiryFilters): boolean {
    if (f.w === 'months') return f.months.length > 0;
    if (f.w === 'custom') return !!(f.from || f.to) && !(f.from && f.to && f.from > f.to);
    return true;
}

export function windowLabel(f: ExpiryFilters, today: Date = new Date()): string {
    const plus = f.includeExpired && f.w !== 'expired' ? ' plus anything already expired' : '';
    switch (f.w) {
        case 'expired': return 'Already expired';
        case 'this-month': return `Expiring in ${monthLabel(monthKey(today))}${plus}`;
        case 'next-month': return `Expiring in ${monthLabel(addMonths(monthKey(today), 1))}${plus}`;
        case 'months': return f.months.length ? `Expiring in ${f.months.map(monthLabel).join(', ')}${plus}` : 'Pick one or more months';
        case 'custom': return f.from || f.to ? `Expiring ${f.from ? `from ${f.from}` : 'up'} ${f.to ? `to ${f.to}` : 'onwards'}${plus}` : 'Pick a date range';
        default: return `Expiring in the next ${f.w} days${plus}`;
    }
}

// ───────────────────────────── showing a row ─────────────────────────────

export type Tone = 'expired' | 'critical' | 'warning' | 'ok';
export const toneOf = (days: number): Tone => (days < 0 ? 'expired' : days <= 30 ? 'critical' : days <= 90 ? 'warning' : 'ok');

export function daysText(days: number): string {
    if (days < 0) return `Expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
    if (days === 0) return 'Expires today';
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export const stockText = (r: Pick<ExpiryRow, 'qtyStrips' | 'qtyLoose' | 'packSize' | 'packType' | 'packUnit'>) =>
    formatQty(r.qtyStrips, r.qtyLoose, r.packSize || 1, r.packType, r.packUnit);

export const NO_DISTRIBUTOR = 'No purchase record';
export const distributorText = (r: Pick<ExpiryRow, 'distributorName' | 'moreSuppliers'>) =>
    (r.distributorName || NO_DISTRIBUTOR) + (r.moreSuppliers ? ' + more' : '');

// ───────────────────────────── selection ─────────────────────────────

export interface Selection {
    /** the ticked batch ids (across pages) */
    ids: string[];
    /** true after "select all N matching": the ids came from the server, so the totals are the server's */
    allMatching: boolean;
}
export const EMPTY_SELECTION: Selection = { ids: [], allMatching: false };

export function toggleId(sel: Selection, id: string): Selection {
    const has = sel.ids.includes(id);
    return { ids: has ? sel.ids.filter((x) => x !== id) : [...sel.ids, id], allMatching: false };
}
export function togglePage(sel: Selection, pageIds: string[]): Selection {
    const all = pageIds.length > 0 && pageIds.every((id) => sel.ids.includes(id));
    return { ids: all ? sel.ids.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...sel.ids, ...pageIds])), allMatching: false };
}
export const selectEverything = (ids: string[]): Selection => ({ ids, allMatching: true });

/** Value of what is ticked. Rows are remembered as they are seen, so ticks on other pages still count. */
export function selectionTotals(sel: Selection, known: Record<string, ExpiryRow>, whole: ExpiryTotals | undefined) {
    if (sel.allMatching && whole) return { batches: whole.batches, mrpValue: whole.mrpValue, costValue: whole.costValue };
    let mrp = 0; let cost = 0; let hasCost = false;
    for (const id of sel.ids) {
        const r = known[id];
        if (!r) continue;
        mrp += r.mrpValue;
        if (r.costValue !== undefined) { cost += r.costValue; hasCost = true; }
    }
    return { batches: sel.ids.length, mrpValue: round2(mrp), costValue: hasCost ? round2(cost) : undefined };
}
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ───────────────────────────── writing stock off ─────────────────────────────

export const REMOVAL_TYPES = [
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'DAMAGED', label: 'Damaged' },
    { value: 'DESTROYED', label: 'Destroyed' },
] as const;
export type RemovalType = (typeof REMOVAL_TYPES)[number]['value'];

/** What to remove from one batch. `null` for either box = the whole batch (nothing was typed). */
export interface RemovalQty { strips: string; loose: string; custom: boolean }
export const wholeBatch = (): RemovalQty => ({ strips: '', loose: '', custom: false });

export const unitsHeld = (r: Pick<ExpiryRow, 'qtyStrips' | 'qtyLoose' | 'packSize'>) => r.qtyStrips * (r.packSize || 1) + r.qtyLoose;

const whole = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : NaN);

/** A message when what is typed cannot be removed from this batch, else null. */
export function removalProblem(r: ExpiryRow, q: RemovalQty): string | null {
    if (!q.custom) return unitsHeld(r) > 0 ? null : 'Nothing in stock';
    const s = whole(q.strips); const l = whole(q.loose);
    if (Number.isNaN(s) || Number.isNaN(l)) return 'Whole numbers only';
    const units = s * (r.packSize || 1) + l;
    if (units <= 0) return 'Enter a quantity to remove';
    if (units > unitsHeld(r)) return `Only ${stockText(r)} in stock`;
    return null;
}

export function buildRemovePayload(rows: ExpiryRow[], qty: Record<string, RemovalQty>, meta: { type: RemovalType; reason: string; password: string }) {
    return {
        type: meta.type,
        reason: meta.reason.trim(),
        password: meta.password,
        items: rows.map((r) => {
            const q = qty[r.id];
            return q?.custom ? { batchId: r.id, qtyStrips: whole(q.strips), qtyLoose: whole(q.loose) } : { batchId: r.id };
        }),
    };
}

/** Value written off by what is typed (needs rates; undefined without them). */
export function removalCost(rows: ExpiryRow[], qty: Record<string, RemovalQty>): number | undefined {
    if (rows.some((r) => r.costValue === undefined)) return undefined;
    let total = 0;
    for (const r of rows) {
        const q = qty[r.id];
        if (!q?.custom) { total += r.costValue!; continue; }
        const units = whole(q.strips) * (r.packSize || 1) + whole(q.loose);
        const share = unitsHeld(r) > 0 && Number.isFinite(units) ? units / unitsHeld(r) : 0;
        total += r.costValue! * share;
    }
    return round2(total);
}

// ───────────────────────────── returning to the distributor ─────────────────────────────

export interface ReturnGroup { invoiceId: string; invoiceNo: string; distributorName: string; rows: ExpiryRow[] }

/**
 * A debit note is made against ONE purchase invoice, so ticked batches are grouped by the invoice that brought them in.
 * Batches with no purchase record cannot be returned this way and are reported separately.
 */
export function returnGroups(rows: ExpiryRow[]): { groups: ReturnGroup[]; cannotReturn: ExpiryRow[] } {
    const map = new Map<string, ReturnGroup>();
    const cannotReturn: ExpiryRow[] = [];
    for (const r of rows) {
        if (!r.purchaseInvoiceId) { cannotReturn.push(r); continue; }
        const g = map.get(r.purchaseInvoiceId) ?? { invoiceId: r.purchaseInvoiceId, invoiceNo: r.purchaseInvoiceNo, distributorName: r.distributorName, rows: [] };
        g.rows.push(r);
        map.set(r.purchaseInvoiceId, g);
    }
    const groups = Array.from(map.values()).sort((a, b) => a.distributorName.localeCompare(b.distributorName) || a.invoiceNo.localeCompare(b.invoiceNo));
    return { groups, cannotReturn };
}

/** The existing purchase-return screen, opened on that invoice with only these batches kept. */
export function returnHref(g: ReturnGroup): string {
    const p = new URLSearchParams({ invoiceNo: g.invoiceNo, invoiceId: g.invoiceId, batchIds: g.rows.map((r) => r.id).join(',') });
    return `/dashboard/accounts/purchase-returns/new?${p}`;
}

// ───────────────────────────── saying who supplied it ─────────────────────────────

/** Which ticked batches an assignment can change: only those with NO purchase invoice (an invoice is the evidence and wins). */
export function splitForAssignment(rows: ExpiryRow[]): { can: ExpiryRow[]; cannot: ExpiryRow[] } {
    const can: ExpiryRow[] = []; const cannot: ExpiryRow[] = [];
    for (const r of rows) (r.purchaseInvoiceId ? cannot : can).push(r);
    return { can, cannot };
}

// ───────────────────────────── grouping the table ─────────────────────────────

export interface RowGroup { key: string; name: string; rows: ExpiryRow[] }
/** Consecutive rows with the same distributor (the server sorted them by distributor when "group" is on). */
export function groupConsecutive(rows: ExpiryRow[]): RowGroup[] {
    const out: RowGroup[] = [];
    for (const r of rows) {
        const key = r.distributorId ?? 'none';
        const last = out[out.length - 1];
        if (last && last.key === key) last.rows.push(r);
        else out.push({ key, name: r.distributorName || NO_DISTRIBUTOR, rows: [r] });
    }
    return out;
}
