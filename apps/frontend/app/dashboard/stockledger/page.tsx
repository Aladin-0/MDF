"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react';
import { useOutletId } from '@/hooks/useOutletId';
import { useLedgerFilters } from '@/hooks/useLedgerFilters';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { TablePagination } from '@/components/shared/TablePagination';
import { BatchCardPanel } from '@/components/stockledger/BatchCardPanel';
import { BatchStrip } from '@/components/stockledger/BatchStrip';
import { InvoiceViewer } from '@/components/stockledger/InvoiceViewer';
import { LedgerFilters } from '@/components/stockledger/LedgerFilters';
import { LedgerHealthBanner, LedgerHealthDialog, useLedgerHealth } from '@/components/stockledger/LedgerHealth';
import { MovementList } from '@/components/stockledger/MovementList';
import { ProductPicker } from '@/components/stockledger/ProductPicker';
import { SummaryStrip } from '@/components/stockledger/SummaryStrip';
import { downloadLedgerExport, fetchLedgerPage, fetchLedgerProduct } from '@/lib/stockLedgerApi';
import { EMPTY_SUMMARY, PAGE_SIZES, formatDay, isRangeValid, toDayString, type InvoiceRef, type ProductHit } from '@/lib/stockLedger';

function StockLedgerView() {
    const outletId = useOutletId();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { hasPermission } = usePermissions();
    const { filters, update } = useLedgerFilters();
    const [exporting, setExporting] = useState(false);
    const [showValues, setShowValues] = useState(false);
    const [healthOpen, setHealthOpen] = useState(false);
    const [viewing, setViewing] = useState<InvoiceRef | null>(null);
    // the same rights the Sales and Purchases pages ask for: a link the API would refuse is not offered
    const canOpen = useCallback((kind: InvoiceRef['kind']) => hasPermission(kind === 'sale' ? 'create_bills' : 'view_purchases'), [hasPermission]);

    const rangeOk = isRangeValid(filters.from, filters.to);
    const hasFilters = !!(filters.q || filters.type);

    // react-query cancels the superseded request and only ever shows the newest answer
    const ledger = useQuery({
        queryKey: ['stock-ledger', outletId, filters.product, filters.batch, filters.type, filters.q, filters.from, filters.to, filters.page, filters.size],
        queryFn: ({ signal }) => fetchLedgerPage({ outletId, from: filters.from, to: filters.to, product: filters.product, batch: filters.batch, type: filters.type, q: filters.q, page: filters.page, size: filters.size }, signal),
        enabled: !!outletId && rangeOk,
        placeholderData: keepPreviousData,       // keep the old rows (dimmed) while the next ones load
        staleTime: 15_000,
    });

    // the product being looked at, with its batches (a link or a refresh has only the id)
    const product = useQuery({
        queryKey: ['stock-ledger-product', outletId, filters.product],
        queryFn: ({ signal }) => fetchLedgerProduct(outletId, filters.product!, signal),
        enabled: !!outletId && !!filters.product,
        staleTime: 60_000,
    });

    // only managers and above can see (and, as admin, repair) the ledger's health: the endpoint says no to anyone else
    const isManager = hasPermission('adjust_stock');
    const health = useLedgerHealth(outletId, isManager);

    const entries = useMemo(() => ledger.data?.entries ?? [], [ledger.data]);
    const summary = ledger.data?.summary ?? EMPTY_SUMMARY;
    const batch = filters.batch ? ledger.data?.batch ?? null : null;
    const totalRecords = ledger.data?.totalRecords ?? 0;
    const totalPages = Math.max(1, ledger.data?.totalPages ?? 1);
    // the summary speaks in the batch's words; for a whole product too, when all its batches share one pack
    const summaryPack = useMemo(() => {
        if (batch) return batch;
        const bs = filters.product ? product.data?.batches ?? [] : [];
        const same = bs.length > 0 && bs.every((b) => b.pack_size === bs[0].pack_size && b.pack_type === bs[0].pack_type && b.pack_unit === bs[0].pack_unit);
        return same ? bs[0] : null;
    }, [batch, filters.product, product.data]);
    const canShowValues = summary.total_value_in !== null;
    const refreshing = ledger.isPlaceholderData;      // dim only while the previous rows stand in for what was just asked for

    // A page past the end (rows were removed, or an old link) goes to the last page instead of showing nothing.
    useEffect(() => {
        if (ledger.data && !ledger.isPlaceholderData && filters.page > totalPages) update({ page: totalPages });
    }, [ledger.data, ledger.isPlaceholderData, filters.page, totalPages, update]);

    const clearFilters = useCallback(() => update({ q: '', type: '' }), [update]);
    const pickProduct = useCallback((p: ProductHit) => {
        queryClient.setQueryData(['stock-ledger-product', outletId, p.id], p);       // its batches are already known: no second wait
        update({ product: p.id, batch: null });
    }, [queryClient, outletId, update]);

    const handleExport = async () => {
        if (!outletId || !rangeOk) return;
        setExporting(true);
        try {
            await downloadLedgerExport({ outletId, from: filters.from, to: filters.to, product: filters.product, batch: filters.batch, type: filters.type, q: filters.q },
                `stock-ledger_${filters.from}_to_${filters.to}_${toDayString(new Date())}.xlsx`);
            toast({ title: 'Export ready', description: 'The Excel file has been downloaded.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: `${apiErrorMessage(e, 'The file could not be created.')} Try again in a moment.` });
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance]">Stock Ledger</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        What came in, what went out, and what is left
                        {rangeOk && <> · <span className="tabular-nums">{formatDay(filters.from)}&nbsp;–&nbsp;{formatDay(filters.to)}</span></>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={handleExport} disabled={exporting || !rangeOk || !outletId}>
                        {exporting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download aria-hidden="true" />}
                        {exporting ? 'Exporting…' : 'Export to Excel'}
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => { ledger.refetch(); product.refetch(); health.refetch(); }} disabled={ledger.isFetching} aria-label="Refresh ledger" title="Refresh">
                        <RefreshCw className={ledger.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" />
                    </Button>
                </div>
            </header>

            {isManager && <LedgerHealthBanner health={health.data} onOpen={() => setHealthOpen(true)} />}

            <Card className="space-y-4 p-3 sm:p-4">
                <ProductPicker outletId={outletId} selectedName={filters.product ? product.data?.name ?? batch?.product_name ?? 'this product' : null} onPick={pickProduct} onClear={() => update({ product: null, batch: null })} />
                <LedgerFilters filters={filters} onChange={update} hasFilters={hasFilters} onClear={clearFilters} />
            </Card>

            {filters.product && product.data && <BatchStrip product={product.data} selectedBatch={filters.batch} onSelect={(id) => update({ batch: id })} />}
            {filters.product && product.isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
            {batch && <BatchCardPanel batch={batch} outletId={outletId} onOpenInvoice={setViewing} canOpen={canOpen} onShowHealth={isManager ? () => setHealthOpen(true) : undefined} />}

            {ledger.isLoading ? (
                <Skeleton className="h-[72px] rounded-xl" role="status" aria-label="Loading summary" />
            ) : (
                <div className="space-y-2">
                    <SummaryStrip summary={summary} movements={totalRecords} pack={summaryPack} showValues={showValues && canShowValues} dimmed={refreshing} />
                    {canShowValues && (
                        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                            <Switch checked={showValues} onCheckedChange={setShowValues} aria-label="Show money values" /> Show rupee values (at cost)
                        </label>
                    )}
                </div>
            )}

            {ledger.isError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Couldn&apos;t load the ledger</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(ledger.error, 'Something went wrong.')} Check your connection and try again.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => ledger.refetch()}>Try again</Button>
                    </AlertDescription>
                </Alert>
            )}

            <Card className="overflow-hidden">
                {!rangeOk ? (
                    <div className="px-6 py-16 text-center text-sm text-muted-foreground">{filters.from && filters.to ? 'Fix the date range above to see movements.' : 'Loading…'}</div>
                ) : (
                    <>
                        <MovementList entries={entries} loading={ledger.isLoading} dimmed={refreshing} hasFilters={hasFilters} onClearFilters={clearFilters} showProduct={!filters.batch} showValues={showValues && canShowValues} onOpenInvoice={setViewing} canOpen={canOpen} />
                        {!ledger.isLoading && totalRecords > 0 && (
                            <TablePagination pageSizes={PAGE_SIZES} busy={ledger.isFetching} page={Math.min(filters.page, totalPages)} totalPages={totalPages} totalRecords={totalRecords}
                                pageSize={filters.size} noun="movements" onPage={(p) => update({ page: p })} onPageSize={(s) => update({ size: s })} />
                        )}
                    </>
                )}
            </Card>

            {/* the invoice a movement came from: the same preview (with Print and Save as PDF) as the Sales and Purchases pages */}
            {viewing && <InvoiceViewer target={viewing} onClose={() => setViewing(null)} />}

            {/* mounted only while open: it holds a password field */}
            {healthOpen && health.data && <LedgerHealthDialog health={health.data} outletId={outletId} onClose={() => setHealthOpen(false)} />}
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
