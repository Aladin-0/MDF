'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TablePagination } from '@/components/shared/TablePagination';
import { EventRow } from '@/components/audit/EventRow';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { CATEGORY_OPTIONS, EMPTY_FILTERS, activeFilterCount, eventParams, groupByDay, type AuditEvent, type AuditPerson, type EventFilters } from '@/lib/audit';
import { downloadAuditExport, fetchEvents } from '@/lib/auditApi';

const PAGE_SIZE = 50;
const field = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">{label}{children}</label>;
}

/** Everything that happened, newest first, grouped by day. The filters are the ones people actually ask: who, what kind, when, how much. */
export function ActivityTab({ filters, setFilters, people, onOpen }: { filters: EventFilters; setFilters: (f: EventFilters) => void; people: AuditPerson[]; onOpen: (e: AuditEvent) => void }) {
    const { toast } = useToast();
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const debouncedQ = useDebounce(filters.q, 400);
    const applied = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
    const params = useMemo(() => { const p = eventParams(applied); p.set('page', String(page)); p.set('pageSize', String(PAGE_SIZE)); return p; }, [applied, page]);

    const feed = useQuery({ queryKey: ['audit', 'events', params.toString()], queryFn: ({ signal }) => fetchEvents(params, signal), placeholderData: keepPreviousData });
    const groups = useMemo(() => groupByDay(feed.data?.results ?? []), [feed.data]);
    const set = (patch: Partial<EventFilters>) => { setPage(1); setFilters({ ...filters, ...patch }); };
    const n = activeFilterCount(filters);

    async function exportNow() {
        setExporting(true);
        try { await downloadAuditExport(eventParams(applied)); }
        catch (err) { toast({ title: 'Export failed', description: apiErrorMessage(err), variant: 'destructive' }); }
        finally { setExporting(false); }
    }

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search bill number, person, reason…" aria-label="Search" className="h-9 w-full sm:w-72" />
                <select aria-label="Who" value={filters.actor} onChange={(e) => set({ actor: e.target.value })} className={`${field} sm:w-44`}>
                    <option value="">Everyone</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select aria-label="What kind" value={filters.category} onChange={(e) => set({ category: e.target.value })} className={`${field} sm:w-44`}>
                    {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                    <SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" /> More filters{n ? ` (${n})` : ''}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9 sm:ml-auto" onClick={exportNow} disabled={exporting}>
                    {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" aria-hidden="true" />} Excel
                </Button>
            </div>

            {open && (
                <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Labeled label="From date"><input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className={field} /></Labeled>
                    <Labeled label="To date"><input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className={field} /></Labeled>
                    <Labeled label="From hour (0–23)"><input type="number" inputMode="numeric" min={0} max={23} value={filters.hourFrom} onChange={(e) => set({ hourFrom: e.target.value })} placeholder="e.g. 22" className={field} /></Labeled>
                    <Labeled label="To hour (0–23)"><input type="number" inputMode="numeric" min={0} max={23} value={filters.hourTo} onChange={(e) => set({ hourTo: e.target.value })} placeholder="e.g. 5" className={field} /></Labeled>
                    <Labeled label="Amount at least (₹)"><input type="number" inputMode="decimal" min={0} value={filters.amountMin} onChange={(e) => set({ amountMin: e.target.value })} className={field} /></Labeled>
                    <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={filters.flaggedOnly} onChange={(e) => set({ flaggedOnly: e.target.checked })} /> Only flagged</label>
                    <div className="col-span-2 flex items-center gap-3 text-xs text-muted-foreground sm:col-span-3 lg:col-span-6">
                        <span>Tip: hours 22 to 5 shows night-time activity.</span>
                        {n > 0 && <button type="button" className="underline" onClick={() => { setPage(1); setFilters(EMPTY_FILTERS); }}>Clear all filters</button>}
                    </div>
                </div>
            )}

            {feed.isLoading && <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
            {!!feed.error && <p role="alert" className="py-4 text-sm text-destructive">{apiErrorMessage(feed.error)}</p>}
            {feed.data && feed.data.count === 0 && (
                <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {n ? 'Nothing matches these filters.' : 'Nothing has been recorded yet.'}{n > 0 && <> <button type="button" className="underline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button></>}
                </p>
            )}

            <div className={feed.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
                {groups.map((g) => (
                    <section key={g.heading} className="mb-4" aria-label={g.heading}>
                        <h3 className="sticky top-0 z-[1] bg-background/95 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">{g.heading}</h3>
                        <div className="overflow-hidden rounded-lg border bg-card">{g.events.map((e) => <EventRow key={e.id} event={e} onOpen={onOpen} />)}</div>
                    </section>
                ))}
            </div>

            {feed.data && feed.data.pagination.pages > 1 && (
                <TablePagination page={page} totalPages={feed.data.pagination.pages} totalRecords={feed.data.count} pageSize={PAGE_SIZE} onPage={setPage} onPageSize={() => undefined} pageSizes={[PAGE_SIZE]} noun="events" busy={feed.isPlaceholderData} />
            )}
        </div>
    );
}
