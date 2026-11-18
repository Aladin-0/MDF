import { API_URL, assertOk, getHeaders } from '@/lib/apiClient';
import type { AuditEvent, AuditFlag, AuditPerson, AuditPolicy, AuditSummary } from '@/lib/audit';

/** Audit API calls, through the shared helpers (`getHeaders`, `assertOk`). Everything here is for the super admin only; the server enforces it. */
async function getJson<T>(path: string, params?: URLSearchParams, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${API_URL}/audit/${path}${params && params.toString() ? `?${params}` : ''}`, { headers: getHeaders(), signal });
    await assertOk(res);
    return res.json();
}

async function send<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_URL}/audit/${path}`, { method, headers: { ...getHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await assertOk(res);
    return res.json();
}

export interface EventPage { results: AuditEvent[]; count: number; pagination: { page: number; pageSize: number; pages: number; total: number } }

export const fetchEvents = (params: URLSearchParams, signal?: AbortSignal) => getJson<EventPage>('events/', params, signal);
export const fetchEvent = (id: string) => getJson<AuditEvent>(`events/${id}/`);
export const fetchFlags = (params: URLSearchParams) => getJson<{ results: AuditFlag[]; count: number }>('flags/', params);
export const fetchSummary = () => getJson<AuditSummary>('summary/');
export const fetchPeople = (days: number) => getJson<{ days: number; results: AuditPerson[] }>('people/', new URLSearchParams({ days: String(days) }));
export const fetchPerson = (id: string) => getJson<{ person: AuditPerson | null; recent: AuditEvent[] }>(`people/${encodeURIComponent(id)}/`);
export const fetchPolicy = () => getJson<AuditPolicy>('policy/');
export const savePolicy = (body: { retentionDays?: number; rules?: Record<string, { enabled?: boolean; [k: string]: number | boolean | undefined }> }) => send<AuditPolicy>('PUT', 'policy/', body);
export const reviewFlag = (id: string, status: 'reviewed' | 'dismissed' | 'new', note = '') => send<AuditFlag>('POST', `flags/${id}/review/`, { status, note });

async function download(path: string, params: URLSearchParams, fallbackName: string) {
    const res = await fetch(`${API_URL}/audit/${path}?${params}`, { headers: getHeaders() });
    await assertOk(res);
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}
export const downloadAuditExport = (params: URLSearchParams) => download('export/', params, 'audit-trail.xlsx');
export const downloadEditLog = (from: string, to: string) => download('edit-log/', new URLSearchParams({ from, to, export: 'xlsx' }), 'edit-log-summary.xlsx');
export const fetchEditLog = (from: string, to: string) => getJson<{ groups: string[]; results: { id: string; name: string; role: string; [g: string]: string | number }[] }>('edit-log/', new URLSearchParams({ from, to }));
