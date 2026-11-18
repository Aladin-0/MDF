/**
 * The audit trail: types and the small pure helpers the screen uses. The wording of each event ("Asha cancelled bill INV-12 (₹1,240)")
 * is written by the server and arrives as `summary`; nothing here rebuilds a sentence from codes.
 */
export type Severity = 'critical' | 'warning' | 'notice' | 'info';
export type Category = 'money' | 'stock' | 'people' | 'settings' | 'data' | 'documents' | 'other';

export interface AuditChange { field: string; label: string; before: unknown; after: unknown }
export interface AuditFlagRef { id: string; rule: string; severity: Severity; title: string; status: string }
export interface AuditEvent {
    id: string;
    occurredAt: string;
    code: string;
    action: string;
    module: string;
    category: Category;
    categoryLabel: string;
    label: string;
    summary: string;
    severity: Severity;
    actor: { id: string | null; name: string; role: string };
    outlet: string;
    entity: { type: string; id: string; label: string; viewer: { kind: 'sale' | 'purchase' | ''; id: string } | null };
    amount: number | null;
    changes: AuditChange[];
    reason: string;
    device: string;
    ip: string | null;
    insideNetwork: boolean | null;
    source: string;
    requestId: string | null;
    flags: AuditFlagRef[];
    metadata?: Record<string, unknown>;
    related?: AuditEvent[];
}
export interface AuditFlag {
    id: string;
    rule: string;
    severity: Severity;
    title: string;
    why: string;
    evidence: Record<string, unknown>;
    status: 'new' | 'reviewed' | 'dismissed';
    createdAt: string;
    person: { id: string; name: string };
    eventId: string;
    event: { occurredAt: string; summary: string; entity: AuditEvent['entity']; amount: number | null; device: string; ip: string | null; insideNetwork: boolean | null };
    review: { by: string; at: string | null; note: string };
}
export interface AuditSummary {
    newFlags: { critical: number; warning: number; notice: number; total: number };
    eventsToday: number;
    lastEventAt: string | null;
    failedWrites: number;
    retentionDays: number;
    lastPurgeAt: string | null;
}
export interface AuditPerson {
    id: string;
    name: string;
    role: string;
    events: number;
    lastActive: string;
    byCategory: Record<string, number>;
    cancelled: number;
    paidBillChanges: number;
    writeOffs: number;
    cancelledVs: number | null;
    paidBillChangesVs: number | null;
    writeOffsVs: number | null;
    flaggedEvents: number;
    openFlags: number;
    devices: { device: string; lastSeen: string }[];
}
export interface AuditRule { code: string; title: string; why: string; enabled: boolean; params: Record<string, number> }
export interface AuditPolicy {
    retentionDays: number;
    minRetentionDays: number;
    rules: AuditRule[];
    health: { events: number; oldestEventAt: string | null; lastEventAt: string | null; failedWrites: number; lastPurgeAt: string | null; lastPurgeCount: number };
}

export const CATEGORY_OPTIONS: { value: Category | ''; label: string }[] = [
    { value: '', label: 'Everything' },
    { value: 'money', label: 'Money & bills' },
    { value: 'stock', label: 'Stock' },
    { value: 'people', label: 'People & sign-ins' },
    { value: 'settings', label: 'Settings' },
    { value: 'data', label: 'Exports' },
];

/** Colour + words for a severity. Never colour alone: the label is always shown too. */
export const SEVERITY: Record<Severity, { label: string; chip: string; dot: string; rank: number }> = {
    critical: { label: 'Serious', chip: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', rank: 3 },
    warning: { label: 'Look at this', chip: 'bg-amber-100 text-amber-900 border-amber-200', dot: 'bg-amber-500', rank: 2 },
    notice: { label: 'Worth a glance', chip: 'bg-sky-100 text-sky-900 border-sky-200', dot: 'bg-sky-500', rank: 1 },
    info: { label: 'Normal', chip: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-300', rank: 0 },
};

export interface EventFilters {
    actor: string;
    category: string;
    flaggedOnly: boolean;
    from: string;
    to: string;
    hourFrom: string;
    hourTo: string;
    amountMin: string;
    q: string;
}
export const EMPTY_FILTERS: EventFilters = { actor: '', category: '', flaggedOnly: false, from: '', to: '', hourFrom: '', hourTo: '', amountMin: '', q: '' };

/** The query string for the feed and the export (only what is set). */
export function eventParams(f: EventFilters): URLSearchParams {
    const p = new URLSearchParams();
    if (f.actor) p.set('actor', f.actor);
    if (f.category) p.set('category', f.category);
    if (f.flaggedOnly) p.set('flagged', '1');
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    if (f.hourFrom !== '') p.set('hourFrom', f.hourFrom);
    if (f.hourTo !== '') p.set('hourTo', f.hourTo);
    if (f.amountMin) p.set('amountMin', f.amountMin);
    if (f.q.trim()) p.set('q', f.q.trim());
    return p;
}

export function activeFilterCount(f: EventFilters): number {
    return (Object.keys(EMPTY_FILTERS) as (keyof EventFilters)[]).filter((k) => f[k] !== EMPTY_FILTERS[k]).length;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today", "Yesterday", "Mon 12 Nov" (the heading of a day's group). */
export function dayHeading(iso: string, now = new Date()): string {
    const d = startOfDay(new Date(iso));
    const diff = Math.round((startOfDay(now).getTime() - d.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function timeText(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function dateTimeText(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "3 min ago", "2 h ago", "5 days ago": for "last seen" and "last active". */
export function ago(iso: string | null, now = new Date()): string {
    if (!iso) return 'never';
    const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86_400)} days ago`;
}

/** Events grouped under their day, newest first (the input is already newest first). */
export function groupByDay(events: AuditEvent[], now = new Date()): { heading: string; events: AuditEvent[] }[] {
    const groups: { heading: string; events: AuditEvent[] }[] = [];
    for (const e of events) {
        const heading = dayHeading(e.occurredAt, now);
        const last = groups[groups.length - 1];
        if (last && last.heading === heading) last.events.push(e);
        else groups.push({ heading, events: [e] });
    }
    return groups;
}

/** One value of a change, as a person would say it. */
export function valueText(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

/** The most severe flag on an event, if any. */
export function worstFlag(flags: AuditFlagRef[]): AuditFlagRef | null {
    return flags.filter((f) => f.status === 'new').sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank)[0] ?? null;
}

/** "2.5× the others" for the People table; nothing when there is no basis to compare. */
export function comparison(n: number, vs: number | null): string {
    if (!n || vs === null) return '';
    if (vs >= 1.5) return `${vs.toFixed(1)}× the others`;
    return '';
}

/** What a rule's number means, for the settings screen. */
export const PARAM_LABELS: Record<string, string> = {
    threshold: 'Raise a flag at',
    high_value: 'A single change over (₹)',
    count: 'Number of batches',
    minutes: 'Within (minutes)',
};
export function paramLabel(rule: string, key: string): string {
    if (rule === 'big_discount' && key === 'threshold') return 'Discount over (%)';
    if (rule === 'backdated_bill' && key === 'threshold') return 'Dated more than (days) back';
    if (rule === 'bulk_writeoff' && key === 'threshold') return 'Stock removed worth over (₹)';
    if (rule === 'credit_limit_raised' && key === 'threshold') return 'Raised by more than (₹)';
    if (rule === 'failed_logins' && key === 'threshold') return 'Wrong passwords';
    if (rule === 'big_export' && key === 'threshold') return 'Rows over';
    if (['paid_bill_changes', 'bill_cancel_spike'].includes(rule) && key === 'threshold') return 'In one day, at least';
    return PARAM_LABELS[key] ?? key;
}
