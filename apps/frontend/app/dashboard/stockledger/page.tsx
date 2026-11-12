"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2, Package, RefreshCw, X } from 'lucide-react';
import { useOutletId } from '@/hooks/useOutletId';
import { useLedgerFilters } from '@/hooks/useLedgerFilters';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { BatchPanel } from '@/components/stockledger/BatchPanel';
import { FilterBar } from '@/components/stockledger/FilterBar';
import { TablePagination } from '@/components/shared/TablePagination';
import { PAGE_SIZES } from '@/lib/stockLedger';
import { LedgerTable } from '@/components/stockledger/LedgerTable';
import { SummaryCards } from '@/components/stockledger/SummaryCards';
import { downloadLedgerExport, fetchLedgerBatches, fetchLedgerPage } from '@/lib/stockLedgerApi';
import { EMPTY_SUMMARY, LOW_STOCK_PACKS, formatDay, formatMonth, isRangeValid, toDayString } from '@/lib/stockLedger';
import { formatDecimalQty } from '@/lib/utils';

function StockLedgerView() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const { filters, update } = useLedgerFilters();
    const [batchSheetOpen, setBatchSheetOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const rangeOk = isRangeValid(filters.from, filters.to);
    const hasFilters = !!(filters.q || filters.type);

    // ── Data ────────────────────────────────────────────────────────────────
    // react-query cancels the superseded request and only ever shows the newest answer, so a slow
    // older response can no longer overwrite a newer one (it could, with the old hand-rolled fetch).
    const ledger = useQuery({
        queryKey: ['stock-ledger', outletId, filters.batch, filters.type, filters.q, filters.from, filters.to, filters.page, filters.size],
        queryFn: ({ signal }) =>
            fetchLedgerPage({ outletId, from: filters.from, to: filters.to, batch: filters.batch, type: filters.type, q: filters.q, page: filters.page, size: filters.size }, signal),
        enabled: !!outletId && rangeOk,
        placeholderData: keepPreviousData, // keep the old rows (dimmed) while the next ones load
        staleTime: 15_000,
    });

    const batches = useQuery({
        queryKey: ['stock-ledger-batches', outletId],
        queryFn: ({ signal }) => fetchLedgerBatches(outletId, signal),
        enabled: !!outletId,
        staleTime: 60_000,
    });

    const entries = useMemo(() => ledger.data?.entries ?? [], [ledger.data]);
    const summary = ledger.data?.summary ?? EMPTY_SUMMARY;
    const totalRecords = ledger.data?.totalRecords ?? 0;
    const totalPages = Math.max(1, ledger.data?.totalPages ?? 1);

    // A page past the end (rows were removed, or an old link) goes to the last page instead of showing nothing.
    useEffect(() => {
        if (ledger.data && !ledger.isPlaceholderData && filters.page > totalPages) update({ page: totalPages });
    }, [ledger.data, ledger.isPlaceholderData, filters.page, totalPages, update]);

    // ── The selected batch ──────────────────────────────────────────────────
    const selected = useMemo(() => {
        if (!filters.batch) return null;
        const fromList = batches.data?.find((b) => b.batch_id === filters.batch);
        if (fromList) return fromList;
        // opened from a shared link before the list loaded (or a batch with no stock): take the name from the rows
        const row = entries.find((e) => e.batch_id === filters.batch);
        return row
            ? { batch_id: row.batch_id, batch_number: row.batch_number, product_name: row.product_name, pack_size: row.pack_size, expiry_date: row.expiry_date, qty_remaining: row.running_qty }
            : null;
    }, [filters.batch, batches.data, entries]);

    const consumedPct = summary.total_in > 0 ? Math.min(100, (summary.total_out / summary.total_in) * 100) : null;

    // ── Actions ─────────────────────────────────────────────────────────────
    const clearFilters = useCallback(() => update({ q: '', type: '' }), [update]);
    const selectBatch = useCallback((id: string | null) => { update({ batch: id }); setBatchSheetOpen(false); }, [update]);

    const handleExport = async () => {
        if (!outletId || !rangeOk) return;
        setExporting(true);
        try {
            await downloadLedgerExport(
                { outletId, from: filters.from, to: filters.to, batch: filters.batch, type: filters.type, q: filters.q },
                `stock-ledger_${filters.from}_to_${filters.to}_${toDayString(new Date())}.xlsx`,
            );
            toast({ title: 'Export ready', description: 'The Excel file has been downloaded.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: `${apiErrorMessage(e, 'The file could not be created.')} Try again in a moment.` });
        } finally {
            setExporting(false);
        }
    };

    // dim only while the previous rows stand in for what was just asked for, not on a quiet background refresh
    const refreshing = ledger.isPlaceholderData;

    return (
        <div className="space-y-4">
            {/* ── Header ── */}
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance]">Stock Ledger</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Every stock movement, newest first
                        {rangeOk && <> · <span className="tabular-nums">{formatDay(filters.from)}&nbsp;–&nbsp;{formatDay(filters.to)}</span></>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={handleExport} disabled={exporting || !rangeOk || !outletId}>
                        {exporting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download aria-hidden="true" />}
                        {exporting ? 'Exporting…' : 'Export to Excel'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => { ledger.refetch(); batches.refetch(); }}
                        disabled={ledger.isFetching}
                        aria-label="Refresh ledger"
                        title="Refresh"
                    >
                        <RefreshCw className={ledger.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" />
                    </Button>
                </div>
            </header>

            {/* ── Filters ── */}
            <Card className="p-4">
                <FilterBar filters={filters} onChange={update} hasFilters={hasFilters} onClear={clearFilters} />
            </Card>

            {/* ── Summary ── */}
            {ledger.isLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading summary">
                    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
                </div>
            ) : (
                <SummaryCards summary={summary} totalRecords={totalRecords} packSize={selected?.pack_size ?? null} dimmed={refreshing} />
            )}

            {/* ── Layout: batches | ledger ── */}
            <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
                <Card className="hidden overflow-hidden lg:sticky lg:top-24 lg:block lg:h-[calc(100dvh-8rem)]">
                    <BatchPanel
                        batches={batches.data ?? []}
                        loading={batches.isLoading}
                        error={batches.isError ? apiErrorMessage(batches.error, 'Check your connection and try again.') : null}
                        onRetry={() => batches.refetch()}
                        selectedId={filters.batch}
                        onSelect={selectBatch}
                    />
                </Card>

                <section aria-label="Stock movements" className="min-w-0 space-y-4">
                    {/* Small screens: the batch list lives in a drawer */}
                    <div className="lg:hidden">
                        <Sheet open={batchSheetOpen} onOpenChange={setBatchSheetOpen}>
                            <SheetTrigger asChild>
                                <Button type="button" variant="outline" className="w-full justify-start">
                                    <Package aria-hidden="true" />
                                    <span className="truncate">{selected ? `${selected.product_name} (${selected.batch_number})` : 'All Batches'}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">Change</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="flex w-[22rem] max-w-[90vw] flex-col p-0">
                                <SheetHeader className="sr-only">
                                    <SheetTitle>Choose a batch</SheetTitle>
                                    <SheetDescription>Filter the ledger to one batch, or show all batches.</SheetDescription>
                                </SheetHeader>
                                <BatchPanel
                                    batches={batches.data ?? []}
                                    loading={batches.isLoading}
                                    error={batches.isError ? apiErrorMessage(batches.error, 'Check your connection and try again.') : null}
                                    onRetry={() => batches.refetch()}
                                    selectedId={filters.batch}
                                    onSelect={selectBatch}
                                />
                            </SheetContent>
                        </Sheet>
                    </div>

                    {/* The batch being looked at */}
                    {filters.batch && (
                        <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch</p>
                                <p className="truncate text-base font-semibold">
                                    {selected?.product_name ?? 'Selected batch'}{' '}
                                    {selected && <span translate="no" className="font-mono text-sm font-medium text-muted-foreground">({selected.batch_number})</span>}
                                </p>
                                {selected && (
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
                                        <span>Now in stock: <span className="font-medium text-foreground">{formatDecimalQty(selected.qty_remaining, selected.pack_size)}</span></span>
                                        {selected.expiry_date && <span>Exp&nbsp;{formatMonth(selected.expiry_date)}</span>}
                                        {selected.qty_remaining > 0 && selected.qty_remaining <= LOW_STOCK_PACKS && (
                                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Low Stock</Badge>
                                        )}
                                    </p>
                                )}
                            </div>
                            {consumedPct !== null && (
                                <div className="w-full sm:w-64">
                                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                                        <span>Dispensed vs received (this period)</span>
                                        <span className="font-medium tabular-nums text-foreground">{consumedPct.toFixed(0)}%</span>
                                    </div>
                                    <Progress value={consumedPct} className="h-2" aria-label="Share of received stock dispensed in this period" />
                                </div>
                            )}
                            <Button type="button" variant="ghost" size="sm" onClick={() => update({ batch: null })}>
                                <X aria-hidden="true" /> Show All Batches
                            </Button>
                        </Card>
                    )}

                    {ledger.isError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                            <AlertTitle>Couldn&apos;t load the ledger</AlertTitle>
                            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                                <span>{apiErrorMessage(ledger.error, 'Something went wrong.')} Check your connection and try again.</span>
                                <Button type="button" size="sm" variant="outline" onClick={() => ledger.refetch()}>Try Again</Button>
                            </AlertDescription>
                        </Alert>
                    )}

                    <Card className="overflow-hidden">
                        {!rangeOk ? (
                            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                                {filters.from && filters.to ? 'Fix the date range above to see movements.' : 'Loading…'}
                            </div>
                        ) : (
                            <>
                                <LedgerTable
                                    entries={entries}
                                    loading={ledger.isLoading}
                                    fetching={ledger.isFetching}
                                    dimmed={ledger.isPlaceholderData}
                                    hasFilters={hasFilters}
                                    onClearFilters={clearFilters}
                                    showProduct={!filters.batch}
                                />
                                {!ledger.isLoading && totalRecords > 0 && (
                                    <TablePagination
                                        pageSizes={PAGE_SIZES}
                                        busy={ledger.isFetching}
                                        page={Math.min(filters.page, totalPages)}
                                        totalPages={totalPages}
                                        totalRecords={totalRecords}
                                        pageSize={filters.size}
                                        onPage={(p) => update({ page: p })}
                                        onPageSize={(s) => update({ size: s })}
                                    />
                                )}
                            </>
                        )}
                    </Card>
                </section>
            </div>
        </div>
    );
}

// useSearchParams() needs a Suspense boundary in the App Router.
export default function StockLedgerPage() {
    return (
        <Suspense fallback={<div className="space-y-4"><Skeleton className="h-9 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>}>
            <StockLedgerView />
        </Suspense>
    );
}
