import { API_URL, assertOk, getHeaders, inventoryApi } from '@/lib/apiClient';
import type { ProductSearchResult } from '@/types';

/** The list endpoint never returns more than this many products per page (it clamps anything larger). */
export const MAX_PAGE_SIZE = 100;
/** Safety stop for "load everything" (100 pages = 10,000 products). */
const MAX_PAGES = 100;

export interface StockQuery {
    search?: string;
    scheduleType?: string;
    lowStock?: boolean;
    expiringSoon?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface FetchedStock {
    products: ProductSearchResult[];
    totalRecords: number;
    /** true if we stopped at the safety limit before the last page */
    truncated: boolean;
}

/**
 * Every product matching a query, page by page.
 *
 * The Expiring and Low Stock tabs asked for `pageSize: 500` in one request. The server clamps to
 * 100, so those tabs silently showed only the first 100 products while the banner counted them as
 * the total. Walking the pages gives the whole list.
 */
export async function fetchAllStock(outletId: string, query: StockQuery, signal?: AbortSignal): Promise<FetchedStock> {
    const products: ProductSearchResult[] = [];
    let totalPages = 1;
    let totalRecords = 0;
    for (let page = 1; page <= totalPages && page <= MAX_PAGES; page += 1) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const res = await inventoryApi.getStock(outletId, { ...query, page, pageSize: MAX_PAGE_SIZE });
        products.push(...(res?.data ?? []));
        totalPages = res?.pagination?.totalPages ?? 1;
        totalRecords = res?.pagination?.totalRecords ?? products.length;
    }
    return { products, totalRecords, truncated: totalPages > MAX_PAGES };
}

async function download(url: string, fileName: string): Promise<void> {
    const res = await fetch(url, { headers: getHeaders() });
    await assertOk(res);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link); // Firefox ignores a click on a link that is not in the page
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Product Summary (Excel): same filters as the list. */
export function downloadProductSummary(outletId: string, query: StockQuery) {
    const p = new URLSearchParams({ outletId, export_format: 'xlsx' });
    if (query.search) p.set('search', query.search);
    if (query.scheduleType && query.scheduleType !== 'all') p.set('scheduleType', query.scheduleType);
    if (query.lowStock) p.set('lowStock', 'true');
    if (query.expiringSoon) p.set('expiringSoon', 'true');
    if (query.sortBy) p.set('sortBy', query.sortBy);
    if (query.sortOrder) p.set('sortOrder', query.sortOrder);
    return download(`${API_URL}/inventory/?${p}`, `product-summary_${today()}.xlsx`);
}

/** Batch Detail (Excel) of what is in stock now. */
export function downloadBatchDetail(outletId: string, search?: string) {
    const p = new URLSearchParams({ outletId, export_format: 'xlsx', report_type: 'current_stock' });
    if (search) p.set('search', search);
    return download(`${API_URL}/reports/batch-wise/export/?${p}`, `batch-detail_${today()}.xlsx`);
}
