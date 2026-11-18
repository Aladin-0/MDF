import { API_URL, assertOk, getHeaders } from '@/lib/apiClient';
import { EMPTY_SUMMARY, type BatchTrace, type LedgerHealth, type LedgerPage, type ProductHit } from '@/lib/stockLedger';

/**
 * Stock ledger API calls, through the shared client helpers (`getHeaders`, `assertOk`) like the rest of the app:
 * an expired session returns to the login page, and a 403 refreshes the user's permissions.
 */

export interface LedgerQuery {
    outletId: string;
    from: string;
    to: string;
    product: string | null;
    batch: string | null;
    type: string;
    q: string;
}

function baseParams(query: LedgerQuery): URLSearchParams {
    const p = new URLSearchParams({ outletId: query.outletId, startDate: query.from, endDate: query.to });
    if (query.batch) p.set('batchId', query.batch);
    else if (query.product) p.set('productId', query.product);
    if (query.type) p.set('txnType', query.type);
    if (query.q) p.set('search', query.q);
    return p;
}

export async function fetchLedgerPage(query: LedgerQuery & { page: number; size: number }, signal?: AbortSignal): Promise<LedgerPage> {
    const params = baseParams(query);
    params.set('page', String(query.page));
    params.set('pageSize', String(query.size));
    const res = await fetch(`${API_URL}/inventory/stockledger/?${params}`, { headers: getHeaders(), signal });
    await assertOk(res);
    const data = await res.json();
    return {
        entries: data.data ?? [],
        summary: { ...EMPTY_SUMMARY, ...(data.summary ?? {}) },
        batch: data.batch ?? null,
        totalRecords: data.pagination?.totalRecords ?? 0,
        totalPages: data.pagination?.totalPages ?? 1,
    };
}

/** One product with its batches, by id (a shared link or a refresh, where nothing was typed). */
export async function fetchLedgerProduct(outletId: string, productId: string, signal?: AbortSignal): Promise<ProductHit | null> {
    const res = await fetch(`${API_URL}/inventory/stockledger/products/?${new URLSearchParams({ outletId, productId })}`, { headers: getHeaders(), signal });
    await assertOk(res);
    return ((await res.json()).data ?? [])[0] ?? null;
}

/** Products (or batch numbers) matching what was typed, each with its batches. */
export async function fetchLedgerProducts(outletId: string, q: string, signal?: AbortSignal): Promise<ProductHit[]> {
    const res = await fetch(`${API_URL}/inventory/stockledger/products/?${new URLSearchParams({ outletId, q })}`, { headers: getHeaders(), signal });
    await assertOk(res);
    return (await res.json()).data ?? [];
}

export async function fetchLedgerHealth(outletId: string, signal?: AbortSignal): Promise<LedgerHealth> {
    const res = await fetch(`${API_URL}/inventory/stockledger/health/?outletId=${encodeURIComponent(outletId)}`, { headers: getHeaders(), signal });
    await assertOk(res);
    return res.json();
}

/** Add the missing opening balances (admin, confirmed with their own password). Rejects with `{error:{code,message}}`. */
export async function repairLedger(outletId: string, password: string): Promise<{ repaired: Record<string, number>; total: number }> {
    const res = await fetch(`${API_URL}/inventory/stockledger/health/?outletId=${encodeURIComponent(outletId)}`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ password }),
    });
    await assertOk(res);
    return res.json();
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

/** Where a batch came from and who got it (a recall, an inspector, a complaint). */
export async function fetchBatchTrace(outletId: string, batchId: string, signal?: AbortSignal): Promise<BatchTrace> {
    const res = await fetch(`${API_URL}/batches/${batchId}/trace/?outletId=${encodeURIComponent(outletId)}`, { headers: getHeaders(), signal });
    await assertOk(res);
    return res.json();
}

/** The same as an Excel file, for the supplier or the inspector. */
export async function downloadBatchTrace(outletId: string, batchId: string, fileName: string): Promise<void> {
    const res = await fetch(`${API_URL}/batches/${batchId}/trace/?outletId=${encodeURIComponent(outletId)}&export=xlsx`, { headers: getHeaders() });
    await assertOk(res);
    const url = window.URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}
