import { API_URL, getHeaders } from '@/lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Stored statuses. SAVED is shown to people as "Draft". */
export type POStatus = 'SAVED' | 'SENT' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type POAction = 'edit' | 'delete' | 'duplicate' | 'receive' | 'send' | 'mark_ordered' | 'resend' | 'cancel' | 'close_short';
export type SendChannel = 'whatsapp_link' | 'pdf_whatsapp' | 'email' | 'manual';

export interface POSummary {
    id: string; poNumber: string; status: POStatus; statusLabel: string;
    distributorId: string; distributorName: string; orderDate: string; expectedDate: string | null;
    sentAt: string | null; sentVia: string; overdue: boolean;
    itemCount: number; orderedQty: number; receivedQty: number;
    /** money is always a string like "1250.00" */
    totalAmount: string; closedShort: boolean;
}

export interface POLine {
    id: string; productId: string; productName: string; packLabel: string; packSize?: number; packType?: string;
    qty: number; receivedQty: number; remainingQty: number; estRate: string; lineTotal: string;
    currentStock: number; minQty: number; onOrder: number; lastPurchaseRate: string | null; shortbookItemId: string | null;
}

export interface POEvent { id: string; action: string; userName: string | null; at: string; payload: Record<string, any> }

export interface PODetail extends POSummary {
    version: number; notes: string; cancelReason: string; expiresAt: string | null;
    distributorPhone: string; distributorEmail: string; distributorLedger: any | null; shareToken: string | null;
    allowedActions: POAction[];
    sendDefaults: { channel: SendChannel; template: string; expiryDays: number; storeName: string };
    items: POLine[]; events: POEvent[];
}

export interface Paginated<T> { results: T[]; pagination: { page: number; pageSize: number; totalPages: number; totalRecords: number } }
export interface POListResponse extends Paginated<POSummary> {
    statusCounts: Record<string, number>; totals: { count: number; amount: string };
}
export interface POItemRow {
    id: string; productId: string; productName: string; poId: string; poNumber: string; status: POStatus; statusLabel: string;
    distributorName: string; ordered: number; received: number; remaining: number; ageDays: number;
}
export interface PODistributorRow { distributorId: string; distributorName: string; openOrders: number; openValue: string; overdue: number; lastSent: string | null }

export interface ShortbookRow {
    id: string; productId: string; productName: string; packLabel: string; qtyNeeded: number; source: string; sourceLabel: string;
    status: 'PENDING' | 'IN_DRAFT' | 'ORDERED' | 'RECEIVED' | 'REMOVED'; statusLabel: string; note: string; customerName: string; customerPhone: string;
    distributorId: string | null; distributorName: string | null; currentStock: number; minQty: number; onOrder: number;
    lastRate: string | null; addedOn: string;
}
/** One distributor's slice of the Shortbook: counts only. Its items are fetched a page at a time when the group is opened. */
export interface ShortbookGroup { key: string; distributorId: string | null; name: string; items: number; pending: number; qty: number }
export interface PageInfo { page: number; pageSize: number; totalPages: number; totalRecords: number }
export interface ShortbookCounts { pending: number; inDraft: number; ordered: number }

/** What a person needs to see while adding one product to the Shortbook. */
export interface ShortbookProductInfo {
    productId: string; name: string; manufacturer: string; packLabel: string;
    currentStock: number; minQty: number; onOrder: number; lastRate: string | null;
    lastDistributor: { id: string; name: string } | null;
    inShortbook: { id: string; qty: number; status: string; statusLabel: string } | null;
}

export interface POSettings {
    autoRulesEnabled: boolean; expiryDays: number; defaultChannel: SendChannel; whatsappTemplate: string;
    numberPrefix: string; showRateToDistributor: boolean; countFreeQty: boolean;
}
export interface PublicPO {
    storeName: string; storePhone: string; storeAddress: string; poNumber: string; status: POStatus; statusLabel: string;
    orderDate: string; expectedDate: string | null; distributorName: string; notes: string; cancelReason: string;
    items: { productName: string; packLabel: string; qty: number; mrp: string | null; rate?: string; lineTotal?: string }[];
    showRates: boolean; totalAmount: string | null;
}

/** An API refusal. `message` is the server's own sentence, safe to show; `code` lets a screen react (STALE, LOCKED, …). */
export class PoApiError extends Error {
    status: number; code: string;
    constructor(message: string, status: number, code = '') { super(message); this.status = status; this.code = code; }
}

// ─── Plumbing ─────────────────────────────────────────────────────────────────

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, ...rest } = init;
    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, { ...rest, headers: getHeaders(), body: json !== undefined ? JSON.stringify(json) : rest.body });
    } catch {
        throw new PoApiError('Could not reach the server. Check your connection and try again.', 0, 'NETWORK');
    }
    if (res.status === 204) return undefined as T;
    let data: any = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
        const detail = (data && (data.detail || data.error?.message || data.error)) || `The server refused the request (${res.status}).`;
        throw new PoApiError(typeof detail === 'string' ? detail : JSON.stringify(detail), res.status, data?.code || '');
    }
    return data as T;
}

const qs = (o: Record<string, unknown>) => {
    const p = new URLSearchParams();
    Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'ALL') p.set(k, String(v)); });
    const s = p.toString();
    return s ? `?${s}` : '';
};

export interface POLineInput { productId: string; orderQty: number; estRate: string | number; shortbookItemId?: string | null }

// ─── Purchase orders ──────────────────────────────────────────────────────────

export const poApi = {
    list: (outletId: string, f: Record<string, unknown> = {}) => call<POListResponse>(`/purchases/orders/${qs({ outletId, ...f })}`),
    get: (outletId: string, id: string) => call<PODetail>(`/purchases/orders/${id}/${qs({ outletId })}`),
    create: (outletId: string, body: { distributorId: string; items: POLineInput[]; notes?: string; expectedDate?: string | null }) =>
        call<PODetail>('/purchases/orders/', { method: 'POST', json: { outletId, ...body } }),
    save: (outletId: string, id: string, body: { version: number; items: POLineInput[]; notes?: string; expectedDate?: string | null; distributorId?: string }) =>
        call<PODetail>(`/purchases/orders/${id}/`, { method: 'PUT', json: { outletId, ...body } }),
    remove: (outletId: string, id: string) => call<void>(`/purchases/orders/${id}/${qs({ outletId })}`, { method: 'DELETE' }),
    send: (outletId: string, id: string, body: { channel: SendChannel; expectedDate?: string | null; message?: string; note?: string }) =>
        call<{ po: PODetail; shareUrl: string; waUrl: string; message: string }>(`/purchases/orders/${id}/send/`,
            { method: 'POST', json: { outletId, baseUrl: typeof window !== 'undefined' ? window.location.origin : '', ...body } }),
    cancel: (outletId: string, id: string, reason: string) => call<PODetail>(`/purchases/orders/${id}/cancel/`, { method: 'POST', json: { outletId, reason } }),
    closeShort: (outletId: string, id: string) => call<PODetail>(`/purchases/orders/${id}/close-short/`, { method: 'POST', json: { outletId } }),
    duplicate: (outletId: string, id: string) => call<PODetail>(`/purchases/orders/${id}/duplicate/`, { method: 'POST', json: { outletId } }),
    open: (outletId: string, distributorId: string) => call<{ results: Pick<POSummary, 'id' | 'poNumber' | 'status' | 'statusLabel' | 'orderDate' | 'expectedDate' | 'itemCount' | 'orderedQty' | 'receivedQty' | 'totalAmount'>[] }>(
        `/purchases/orders/open/${qs({ outletId, distributorId })}`),
    items: (outletId: string, f: Record<string, unknown> = {}) => call<Paginated<POItemRow>>(`/purchases/orders/items/${qs({ outletId, ...f })}`),
    byDistributor: (outletId: string) => call<{ results: PODistributorRow[] }>(`/purchases/orders/by-distributor/${qs({ outletId })}`),
    suggestions: (outletId: string, distributorId?: string) => call<{ data: any[] }>(`/purchases/orders/suggestions/${qs({ outletId, distributorId })}`),
    // Export files are fetched as blobs by the screen (they need the auth header)
    exportUrl: (outletId: string, id: string, kind: 'pdf' | 'excel') => `${API_URL}/purchases/orders/${id}/export/${kind}/${qs({ outletId })}`,

    // ── Shortbook ──
    shortbook: (outletId: string, f: Record<string, unknown> = {}) =>
        call<{ results: ShortbookRow[]; counts: { pending: number; inDraft: number; ordered: number } }>(`/purchases/shortbook/${qs({ outletId, ...f })}`),
    shortbookProductInfo: (outletId: string, productId: string) =>
        call<ShortbookProductInfo>(`/purchases/shortbook/product-info/${qs({ outletId, productId })}`),
    /** The distributor groups (a page of them), with counts and no rows. */
    shortbookGroups: (outletId: string, f: Record<string, unknown> = {}) =>
        call<{ groups: ShortbookGroup[]; pagination: PageInfo; counts: ShortbookCounts }>(`/purchases/shortbook/${qs({ outletId, view: 'groups', ...f })}`),
    /** One group's items (key = distributor id, or 'none'), a page at a time. */
    shortbookGroupItems: (outletId: string, key: string, f: Record<string, unknown> = {}) =>
        call<{ results: ShortbookRow[]; pagination: PageInfo; counts: ShortbookCounts }>(`/purchases/shortbook/${qs({ outletId, distributorId: key, ...f })}`),
    shortbookAdd: (outletId: string, body: { productId: string; qty: number; source?: string; note?: string; distributorId?: string; customerName?: string; customerPhone?: string }) =>
        call<ShortbookRow>('/purchases/shortbook/', { method: 'POST', json: { outletId, ...body } }),
    shortbookPatch: (outletId: string, id: string, body: { qtyNeeded?: number; distributorId?: string; note?: string }) =>
        call<ShortbookRow>(`/purchases/shortbook/${id}/`, { method: 'PATCH', json: { outletId, ...body } }),
    shortbookRemove: (outletId: string, id: string) => call<void>(`/purchases/shortbook/${id}/${qs({ outletId })}`, { method: 'DELETE' }),
    shortbookBulk: (outletId: string, body: { ids: string[]; distributorIds?: string[]; action: 'remove' | 'set_distributor'; distributorId?: string }) =>
        call<{ updated: number }>('/purchases/shortbook/bulk/', { method: 'POST', json: { outletId, ...body } }),
    /** `distributorIds` = "every pending item of these distributors" (a group-wide select-all, however many pages it spans). */
    shortbookCreatePOs: (outletId: string, itemIds: string[], distributorIds: string[] = []) =>
        call<{ created: { id: string; poNumber: string; distributorName: string; itemCount: number; totalAmount: string }[] }>('/purchases/shortbook/create-pos/',
            { method: 'POST', json: { outletId, itemIds, distributorIds } }),

    // ── Settings & public page ──
    settings: (outletId: string) => call<POSettings>(`/purchases/settings/po/${qs({ outletId })}`),
    saveSettings: (outletId: string, body: Partial<POSettings> & { password: string }) => call<POSettings>('/purchases/settings/po/', { method: 'PUT', json: { outletId, ...body } }),
};

/** The public page is for a distributor with no login: no auth header, its own tiny fetch. */
export async function fetchPublicPO(token: string): Promise<PublicPO> {
    const res = await fetch(`${API_URL}/purchases/public/po/${encodeURIComponent(token)}/`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new PoApiError(data?.detail || 'This link is not valid.', res.status);
    return data as PublicPO;
}

export const money = (v: string | number | null | undefined) =>
    '₹' + Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
