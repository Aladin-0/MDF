'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarX2, Download, Loader2, PackageCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TablePagination } from '@/components/shared/TablePagination';
import { AssignSupplierDialog } from '@/components/expiry/AssignSupplierDialog';
import { ExpiryActionBar } from '@/components/expiry/ExpiryActionBar';
import { ExpiryFilterBar } from '@/components/expiry/ExpiryFilterBar';
import { ExpiryList } from '@/components/expiry/ExpiryList';
import { ExpirySummary } from '@/components/expiry/ExpirySummary';
import { RemoveStockDialog } from '@/components/expiry/RemoveStockDialog';
import { ReturnToDistributorDialog } from '@/components/expiry/ReturnToDistributorDialog';
import { useExpiryFilters } from '@/hooks/useExpiryFilters';
import { useOutletId } from '@/hooks/useOutletId';
import { useDistributors } from '@/hooks/usePurchases';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { downloadExpiryExport, downloadExpirySelected, fetchAllExpiryRows, fetchExpiry, type AssignResult, type RemoveResult } from '@/lib/expiryApi';
import {
    EMPTY_SELECTION, PAGE_SIZES, isAskable, selectEverything, selectionTotals, serverParams, togglePage, toggleId,
    type ExpiryRow, type Selection,
} from '@/lib/expiryManager';
import { formatCurrency } from '@/lib/gst';

function ExpiryManagerView() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { filters, update } = useExpiryFilters();
    const distributors = useDistributors();

    const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
    const [known, setKnown] = useState<Record<string, ExpiryRow>>({});
    const [busy, setBusy] = useState<'export' | 'rows' | 'ids' | null>(null);
    const [dialog, setDialog] = useState<{ kind: 'remove' | 'return' | 'assign'; rows: ExpiryRow[] } | null>(null);

    const askable = isAskable(filters);
    // what MATCHES (not the page): a change here invalidates what is ticked
    const matchKey = useMemo(() => JSON.stringify({ outletId, ...serverParams(filters) }), [outletId, filters]);
    const query = useQuery({
        queryKey: ['inventory', 'expiry', matchKey, filters.page, filters.size],
        queryFn: ({ signal }) => fetchExpiry(outletId, filters, { page: filters.page, size: filters.size }, signal),
        enabled: !!outletId && askable,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
    const data = query.data;
    const showCost = data?.totals.costValue !== undefined;

    useEffect(() => { setSelection(EMPTY_SELECTION); }, [matchKey]);           // other rows now: ticks no longer mean the same thing
    useEffect(() => { if (data) setKnown((k) => ({ ...k, ...Object.fromEntries(data.data.map((r) => [r.id, r])) })); }, [data]);

    const totals = selectionTotals(selection, known, data?.totals);
    const pageIds = data?.data.map((r) => r.id) ?? [];
    const pageAllTicked = pageIds.length > 0 && pageIds.every((id) => selection.ids.includes(id));
    const moreMatching = (data?.pagination.total ?? 0) > pageIds.length;

    const run = async <T,>(kind: 'export' | 'rows' | 'ids', fn: () => Promise<T>, failTitle: string): Promise<T | undefined> => {
        setBusy(kind);
        try { return await fn(); }
        catch (e) { toast({ variant: 'destructive', title: failTitle, description: apiErrorMessage(e, 'Please try again.') }); return undefined; }
        finally { setBusy(null); }
    };

    const selectAllMatching = () => run('ids', async () => {
        const res = await fetchExpiry(outletId, filters, { page: 1, size: 1, withIds: true });
        if (res.idsTruncated) { toast({ variant: 'destructive', title: 'Too many to select at once', description: 'Narrow the dates or pick a distributor first.' }); return; }
        setSelection(selectEverything(res.matchingIds ?? []));
    }, 'Could not select them all');

    /** the ticked rows, each with its details (rows on other pages are fetched when needed) */
    const resolveRows = async (): Promise<ExpiryRow[]> => {
        if (selection.ids.every((id) => known[id])) return selection.ids.map((id) => known[id]);
        const all = await fetchAllExpiryRows(outletId, filters);
        setKnown((k) => ({ ...k, ...Object.fromEntries(all.map((r) => [r.id, r])) }));
        const want = new Set(selection.ids);
        return all.filter((r) => want.has(r.id));
    };
    const open = (kind: 'remove' | 'return' | 'assign') => run('rows', async () => {
        const rows = await resolveRows();
        if (rows.length === 0) { toast({ variant: 'destructive', title: 'Those batches have changed', description: 'Refresh the list and select again.' }); return; }
        setDialog({ kind, rows });
    }, 'Could not load the selected batches');

    const exportNow = () => run('export', async () => {
        if (selection.ids.length) await downloadExpirySelected(outletId, selection.ids); else await downloadExpiryExport(outletId, filters);
        toast({ title: 'Export ready', description: 'The Excel file has been downloaded.' });
    }, 'Export failed');

    const removed = useRef<(r: RemoveResult) => void>(() => {});
    removed.current = async (res) => {
        setDialog(null);
        setSelection(EMPTY_SELECTION);
        await queryClient.invalidateQueries({ queryKey: ['inventory'] });            // this page's key lives under ['inventory']
        toast({
            title: `${res.batches} ${res.batches === 1 ? 'batch' : 'batches'} removed from stock`,
            description: res.costValue !== undefined ? `Cost written off: ${formatCurrency(res.costValue)}. It is in the stock ledger and your GST adjustments.` : 'It is in the stock ledger and your GST adjustments.',
            duration: 10000,
        });
    };

    const assigned = async (res: AssignResult) => {
        setDialog(null);
        setSelection(EMPTY_SELECTION);
        await queryClient.invalidateQueries({ queryKey: ['inventory'] });
        toast({
            title: res.distributor ? `${res.updated} ${res.updated === 1 ? 'batch' : 'batches'} assigned to ${res.distributor}` : `Supplier cleared on ${res.updated} ${res.updated === 1 ? 'batch' : 'batches'}`,
            description: res.skipped.length ? `${res.skipped.length} left alone: they came in through a purchase invoice, which decides the supplier.` : undefined,
        });
    };

    const pickDistributor = useCallback((id: string) => {
        update({ distributors: filters.distributors.includes(id) ? filters.distributors.filter((d) => d !== id) : [...filters.distributors, id] });
    }, [filters.distributors, update]);

    const exportAllDisabled = !data || data.pagination.total === 0 || busy !== null;

    return (
        <div className="space-y-5">
            <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div>
                    <Link href="/dashboard/inventory" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Inventory</Link>
                    <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance]">Expiry Manager</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Find stock that is close to expiry, send it back, or take it out of inventory</p>
                </div>
                <Button type="button" variant="outline" onClick={() => { setSelection(EMPTY_SELECTION); void exportNow(); }} disabled={exportAllDisabled} className="max-sm:w-full">
                    {busy === 'export' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Export all to Excel
                </Button>
            </header>

            <ExpiryFilterBar filters={filters} distributors={(distributors.data ?? []).map((d: any) => ({ id: d.id, name: d.name }))} onChange={update} />

            {!askable ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {filters.w === 'months' ? 'Pick one or more months above to see what expires then.' : 'Choose a valid date range above (“From” must not be after “To”).'}
                </div>
            ) : query.isError && !data ? (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Couldn&apos;t load expiring stock</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(query.error, 'Something went wrong.')} Check your connection and try again.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => query.refetch()}>Try again</Button>
                    </AlertDescription>
                </Alert>
            ) : (
                <>
                    <ExpirySummary totals={data?.totals} groups={data?.groups ?? []} chosen={filters.distributors} onPick={pickDistributor} loading={query.isPlaceholderData} />

                    {query.isLoading ? (
                        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>
                    ) : data && data.pagination.total === 0 ? (
                        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
                            {filters.w === 'expired' ? <PackageCheck className="h-10 w-10 text-emerald-600" aria-hidden="true" /> : <CalendarX2 className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
                            <p className="font-medium">{filters.w === 'expired' ? 'Nothing on your shelves has expired.' : 'Nothing expires in this window.'}</p>
                            <p className="max-w-md text-sm text-muted-foreground">Only batches that still have stock are listed{filters.distributors.length || filters.q ? ', and your distributor / search filters narrow it further' : ''}.</p>
                            {filters.w !== '180' && <Button type="button" variant="outline" onClick={() => update({ w: '180' })}>Look 180 days ahead</Button>}
                        </div>
                    ) : data && (
                        <>
                            {pageAllTicked && moreMatching && !selection.allMatching && (
                                <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                                    All {pageIds.length} on this page are selected.
                                    <Button type="button" variant="link" className="h-auto p-0" onClick={selectAllMatching} disabled={busy === 'ids'}>{busy === 'ids' ? 'Selecting…' : `Select all ${data.pagination.total} that match`}</Button>
                                </p>
                            )}
                            {selection.allMatching && (
                                <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                                    All {selection.ids.length} matching batches are selected.
                                    <Button type="button" variant="link" className="h-auto p-0" onClick={() => setSelection(EMPTY_SELECTION)}>Clear</Button>
                                </p>
                            )}
                            <ExpiryList
                                rows={data.data} groups={data.groups} grouped={filters.group} selection={selection} showCost={showCost}
                                busy={query.isPlaceholderData}
                                onToggle={(id) => setSelection((s) => toggleId(s, id))}
                                onTogglePage={(ids) => setSelection((s) => togglePage(s, ids))}
                            />
                            <TablePagination
                                page={data.pagination.page} totalPages={data.pagination.pages} totalRecords={data.pagination.total} pageSize={data.pagination.pageSize}
                                onPage={(page) => update({ page })} onPageSize={(size) => update({ size, page: 1 })} noun="batches" pageSizes={PAGE_SIZES} busy={query.isPlaceholderData}
                            />
                        </>
                    )}
                </>
            )}

            {selection.ids.length > 0 && (
                <ExpiryActionBar
                    batches={totals.batches} costValue={totals.costValue} mrpValue={totals.mrpValue}
                    busy={busy === 'export' ? 'export' : busy === 'rows' ? 'rows' : null}
                    onExport={() => void exportNow()} onAssign={() => void open('assign')} onReturn={() => void open('return')} onRemove={() => void open('remove')}
                    onClear={() => setSelection(EMPTY_SELECTION)}
                />
            )}

            {/* mounted only while open: it holds a PIN and a quantity form */}
            {dialog?.kind === 'remove' && <RemoveStockDialog rows={dialog.rows} outletId={outletId} onClose={() => setDialog(null)} onDone={(r) => removed.current(r)} />}
            {dialog?.kind === 'assign' && <AssignSupplierDialog rows={dialog.rows} outletId={outletId} distributors={(distributors.data ?? []).map((d: any) => ({ id: d.id, name: d.name }))} onClose={() => setDialog(null)} onDone={assigned} />}
            {dialog?.kind === 'return' && <ReturnToDistributorDialog rows={dialog.rows} onClose={() => setDialog(null)} />}
        </div>
    );
}

// useSearchParams() needs a Suspense boundary in the App Router.
export default function ExpiryManagerPage() {
    return (
        <Suspense fallback={<div className="space-y-5"><Skeleton className="h-9 w-56" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>}>
            <ExpiryManagerView />
        </Suspense>
    );
}
