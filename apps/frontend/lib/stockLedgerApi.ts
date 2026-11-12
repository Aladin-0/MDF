import { API_URL, assertOk, getHeaders } from '@/lib/apiClient';
import { EMPTY_SUMMARY, type BatchSummaryItem, type LedgerPage } from '@/lib/stockLedger';

/**
 * Stock ledger API calls.
 *
 * They go through the shared client helpers (`getHeaders`, `assertOk`) like the rest of the app.
 * This page used to read the token cookie and call `fetch` itself, so an expired session showed
 * a red "Error 401" box instead of returning to the login page, and a 403 never refreshed the
 * user's permissions.
 */

export interface LedgerQuery {
    outletId: string;
    from: string;
    to: string;
    batch: string | null;
    type: string;
    q: string;
}

function baseParams(query: LedgerQuery): URLSearchParams {
    const p = new URLSearchParams({ outletId: query.outletId, startDate: query.from, endDate: query.to });
    if (query.batch) p.set('batchId', query.batch);
    if (query.type) p.set('txnType', query.type);
    if (query.q) p.set('search', query.q);
    return p;
}

export async function fetchLedgerPage(
    query: LedgerQuery & { page: number; size: number },
    signal?: AbortSignal,
): Promise<LedgerPage> {
    const params = baseParams(query);
    params.set('page', String(query.page));
    params.set('pageSize', String(query.size));
    const res = await fetch(`${API_URL}/inventory/stockledger/?${params}`, { headers: getHeaders(), signal });
    await assertOk(res);
    const data = await res.json();
    return {
        entries: data.data ?? [],
        summary: data.summary ?? EMPTY_SUMMARY,
        totalRecords: data.pagination?.totalRecords ?? 0,
        totalPages: data.pagination?.totalPages ?? 1,
    };
}

export async function fetchLedgerBatches(outletId: string, signal?: AbortSignal): Promise<BatchSummaryItem[]> {
    const res = await fetch(`${API_URL}/inventory/stockledger/batches/?outletId=${encodeURIComponent(outletId)}`, {
        headers: getHeaders(),
        signal,
    });
    await assertOk(res);
    return (await res.json()) ?? [];
}

/** Download the filtered ledger as an Excel file. Same filters as the screen, all pages. */
export async function downloadLedgerExport(query: LedgerQuery, fileName: string): Promise<void> {
    const params = baseParams(query);
    params.set('export_format', 'xlsx');
    const res = await fetch(`${API_URL}/inventory/stockledger/?${params}`, { headers: getHeaders() });
    await assertOk(res);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}
