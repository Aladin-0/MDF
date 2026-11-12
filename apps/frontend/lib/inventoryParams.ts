/**
 * The Inventory page's state, kept in the URL (?tab&q&schedule&sort&order&page&size).
 * Pure functions; the hook in hooks/useInventoryFilters.ts wires them to the router.
 */

export type InventoryTab = 'all' | 'expiring' | 'low_stock';
export const TABS: readonly InventoryTab[] = ['all', 'expiring', 'low_stock'];

/** The only columns the server can sort by (inventory/views.py `sort_map`). */
export const SORT_KEYS = ['name', 'stock', 'expiry'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** The server returns at most 100 rows a page; offering more (the table offered 250) made the footer lie. */
export const INVENTORY_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_SIZE = 50;

export interface InventoryParams {
    tab: InventoryTab;
    q: string;
    schedule: string;
    sort: SortKey;
    order: 'asc' | 'desc';
    page: number;
    size: number;
}

export function readInventoryParams(sp: URLSearchParams): InventoryParams {
    const tab = sp.get('tab') as InventoryTab;
    const sort = sp.get('sort') as SortKey;
    const size = Number(sp.get('size'));
    return {
        tab: TABS.includes(tab) ? tab : 'all',
        q: sp.get('q') ?? '',
        schedule: sp.get('schedule') || 'all',
        sort: SORT_KEYS.includes(sort) ? sort : 'name',
        order: sp.get('order') === 'desc' ? 'desc' : 'asc',
        page: Math.max(1, Math.floor(Number(sp.get('page'))) || 1),
        size: (INVENTORY_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
    };
}

/**
 * Change the URL's query string. Anything that changes WHAT is listed (tab, search, schedule, sort,
 * page size) goes back to page 1 in the same update. Defaults are dropped to keep the URL clean.
 */
export function applyInventoryPatch(current: URLSearchParams, patch: Partial<InventoryParams>): URLSearchParams {
    const next = new URLSearchParams(current.toString());
    const set = (key: string, value: unknown, fallback: unknown = '') => {
        if (value === undefined || value === null || value === '' || value === fallback) next.delete(key);
        else next.set(key, String(value));
    };
    if ('tab' in patch) set('tab', patch.tab, 'all');
    if ('q' in patch) set('q', patch.q?.trim());
    if ('schedule' in patch) set('schedule', patch.schedule, 'all');
    if ('sort' in patch) set('sort', patch.sort, 'name');
    if ('order' in patch) set('order', patch.order, 'asc');
    if ('size' in patch) set('size', patch.size, DEFAULT_SIZE);
    if ('page' in patch) set('page', patch.page, 1);
    else if (Object.keys(patch).length > 0) next.delete('page');
    return next;
}

/** What the Clear Filters button removes: search and schedule only, never the tab or the sort. */
export const hasActiveFilters = (p: InventoryParams) => !!p.q || p.schedule !== 'all';
