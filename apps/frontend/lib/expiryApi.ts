import { API_URL, assertOk, getHeaders } from '@/lib/apiClient';
import { serverParams, type ExpiryFilters, type ExpiryResponse, type ExpiryRow, type RemovalType } from '@/lib/expiryManager';

const MAX_PAGES = 60;                       // 60 x 100 = 6,000 batches: a safety stop for "load everything"

export interface ExpiryQuery { page: number; size: number; withIds?: boolean }

/** One page of near-expiry batches, with the totals and per-distributor groups of EVERY match. */
export async function fetchExpiry(outletId: string, f: ExpiryFilters, q: ExpiryQuery, signal?: AbortSignal): Promise<ExpiryResponse> {
    const p = new URLSearchParams({ outletId, ...serverParams(f), page: String(q.page), pageSize: String(q.size) });
    if (q.withIds) p.set('withIds', 'true');
    const res = await fetch(`${API_URL}/inventory/expiry/?${p}`, { headers: getHeaders(), signal });
    await assertOk(res);
    return res.json();
}

/** Every matching row (the removal list and the return list show each batch). Walks the 100-row pages. */
export async function fetchAllExpiryRows(outletId: string, f: ExpiryFilters): Promise<ExpiryRow[]> {
    const rows: ExpiryRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetchExpiry(outletId, f, { page, size: 100 });
        rows.push(...res.data);
        if (page >= res.pagination.pages) break;
    }
    return rows;
}

async function save(res: Response, fileName: string) {
    await assertOk(res);
    const href = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);        // Firefox ignores a click on a link that is not in the page
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
}

const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Excel of everything the filters match. */
export async function downloadExpiryExport(outletId: string, f: ExpiryFilters) {
    const p = new URLSearchParams({ outletId, ...serverParams(f) });
    await save(await fetch(`${API_URL}/inventory/expiry/export/?${p}`, { headers: getHeaders() }), `near-expiry_${stamp()}.xlsx`);
}

/** Excel of exactly the ticked batches. */
export async function downloadExpirySelected(outletId: string, batchIds: string[]) {
    const res = await fetch(`${API_URL}/inventory/expiry/export/?outletId=${encodeURIComponent(outletId)}`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ batchIds }),
    });
    await save(res, `near-expiry-selected_${stamp()}.xlsx`);
}

export interface RemoveResult {
    success: boolean;
    batches: number;
    costValue?: number;
    removed: { batchId: string; batchNo: string; productName: string; removedUnits: number; removedPacks: number; costValue?: number }[];
}

/** Write the batches off, all or nothing. Rejects with the server's `{error:{code,message,batchId}}`. */
export async function removeExpiryStock(
    outletId: string,
    payload: { type: RemovalType; reason: string; password: string; items: { batchId: string; qtyStrips?: number; qtyLoose?: number }[] },
): Promise<RemoveResult> {
    const res = await fetch(`${API_URL}/inventory/expiry/remove/?outletId=${encodeURIComponent(outletId)}`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    });
    await assertOk(res);
    return res.json();
}

export interface AssignResult { updated: number; skipped: { batchId: string; reason: 'NOT_FOUND' | 'HAS_PURCHASE' }[]; distributor: string | null }

/** Say who supplied stock that has no purchase invoice. A batch with a posted purchase keeps its invoice's supplier (it is skipped). */
export async function assignBatchSupplier(outletId: string, batchIds: string[], distributorId: string | null): Promise<AssignResult> {
    const res = await fetch(`${API_URL}/inventory/batches/assign-supplier/?outletId=${encodeURIComponent(outletId)}`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ batchIds, distributorId }),
    });
    await assertOk(res);
    return res.json();
}
