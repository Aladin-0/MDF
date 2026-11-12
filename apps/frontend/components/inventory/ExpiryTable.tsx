'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, SlidersHorizontal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { TablePagination } from '@/components/shared/TablePagination';
import { ListBanner } from '@/components/inventory/ListBanner';
import { useOutletId } from '@/hooks/useOutletId';
import { apiErrorMessage } from '@/lib/apiError';
import { daysUntil, formatDay } from '@/lib/dates';
import { exportToCSV } from '@/lib/export';
import { formatCurrency } from '@/lib/gst';
import { batchValue, expiryText } from '@/lib/inventory';
import { fetchAllStock } from '@/lib/inventoryApi';
import { cn, formatQty } from '@/lib/utils';
import { useInventoryStore } from '@/store/inventoryStore';
import type { Batch, ProductSearchResult } from '@/types';

type Span = 'expired' | 30 | 60 | 90;
const WINDOWS: { value: Span; label: string }[] = [
    { value: 'expired', label: 'Expired' },
    { value: 30, label: '30 Days' },
    { value: 60, label: '60 Days' },
    { value: 90, label: '90 Days' },
];

interface Row { product: ProductSearchResult; batch: Batch; days: number; value: number }

export function ExpiryTable({ onAdjustClick }: { onAdjustClick: (batch: Batch, product: ProductSearchResult) => void }) {
    const outletId = useOutletId();
    const { valuationMode } = useInventoryStore();
    const [span, setSpan] = useState<Span>(90);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(50);

    // Every product with stock expiring within 90 days (already expired included), all pages.
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['inventory', 'expiring', outletId],
        queryFn: ({ signal }) => fetchAllStock(outletId, { expiringSoon: true, sortBy: 'expiry', sortOrder: 'asc' }, signal),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 2,
    });

    const allRows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        for (const product of data?.products ?? []) {
            for (const batch of product.batches ?? []) {
                if (!batch.expiryDate || (batch.qtyStrips <= 0 && batch.qtyLoose <= 0)) continue; // only stock that is still there
                const days = daysUntil(batch.expiryDate);
                if (days > 90) continue;
                out.push({ product, batch, days, value: batchValue(batch, valuationMode, product.packSize || 1) });
            }
        }
        return out.sort((a, b) => a.days - b.days);
    }, [data, valuationMode]);

    const inWindow = (r: Row) => (span === 'expired' ? r.days < 0 : r.days <= span);
    const counts = useMemo(() => Object.fromEntries(WINDOWS.map((w) => [String(w.value), allRows.filter((r) => (w.value === 'expired' ? r.days < 0 : r.days <= w.value)).length])), [allRows]);
    const rows = allRows.filter(inWindow);
    const valueAtRisk = rows.reduce((sum, r) => sum + r.value, 0);

    const totalPages = Math.max(1, Math.ceil(rows.length / size));
    const current = Math.min(page, totalPages);
    const visible = rows.slice((current - 1) * size, current * size);

    const pick = (w: Span) => { setSpan(w); setPage(1); };

    const exportList = () =>
        exportToCSV(
            rows.map((r) => ({
                product: r.product.name,
                batch: r.batch.batchNo,
                expiry: r.batch.expiryDate,
                days: r.days,
                stock: formatQty(r.batch.qtyStrips, r.batch.qtyLoose, r.batch.packSize, r.batch.packType, r.batch.packUnit),
                rack: r.batch.rackLocation ?? '',
                value: r.value.toFixed(2),
            })),
            'expiring-stock',
            [
                { key: 'product', label: 'Product' }, { key: 'batch', label: 'Batch' }, { key: 'expiry', label: 'Expiry Date' },
                { key: 'days', label: 'Days Left' }, { key: 'stock', label: 'In Stock' }, { key: 'rack', label: 'Rack' }, { key: 'value', label: 'Value' },
            ],
        );

    return (
        <div className="space-y-4">
            <ListBanner
                tone="amber"
                icon={<AlertTriangle className="h-5 w-5" />}
                title={isLoading ? 'Checking expiry dates…' : `${rows.length} ${rows.length === 1 ? 'batch' : 'batches'} ${span === 'expired' ? 'already expired' : `expiring within ${span} days`}`}
                description={isLoading ? undefined : `Stock value at risk: ${formatCurrency(valueAtRisk)} (at ${valuationMode.toLowerCase()} price)`}
                actions={<Button type="button" variant="outline" size="sm" onClick={exportList} disabled={rows.length === 0}><Download aria-hidden="true" /> Export CSV</Button>}
            />

            <div role="group" aria-label="Expiry window" className="flex flex-wrap gap-2">
                {WINDOWS.map((w) => (
                    <Button
                        key={String(w.value)}
                        type="button"
                        size="sm"
                        variant={span === w.value ? 'default' : 'outline'}
                        aria-pressed={span === w.value}
                        onClick={() => pick(w.value)}
                    >
                        {w.label} <span className={cn('ml-1.5 tabular-nums', span === w.value ? 'opacity-90' : 'text-muted-foreground')}>{isLoading ? '' : counts[String(w.value)]}</span>
                    </Button>
                ))}
            </div>

            {isError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Couldn&apos;t load expiring stock</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(error, 'Something went wrong.')} Check your connection and try again.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Try Again</Button>
                    </AlertDescription>
                </Alert>
            )}
            {data?.truncated && (
                <Alert><AlertDescription>This list is very long, so only the first {data.products.length.toLocaleString('en-IN')} products are shown.</AlertDescription></Alert>
            )}

            <div className="overflow-hidden rounded-xl border bg-card">
                <div className="overflow-x-auto">
                    <Table className="min-w-[48rem]">
                        <caption className="sr-only">Batches that expire soon or have expired</caption>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead scope="col">Product</TableHead>
                                <TableHead scope="col">Batch</TableHead>
                                <TableHead scope="col">Expiry</TableHead>
                                <TableHead scope="col" className="text-right">In Stock</TableHead>
                                <TableHead scope="col">Rack</TableHead>
                                <TableHead scope="col" className="text-right">Value</TableHead>
                                <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }, (_, i) => <TableRow key={i} className="hover:bg-transparent"><TableCell colSpan={7}><Skeleton className="h-9 w-full" /></TableCell></TableRow>)
                            ) : visible.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={7} className="py-16 text-center">
                                        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500/60" aria-hidden="true" />
                                        <p className="font-medium">{span === 'expired' ? 'No expired stock on the shelves' : `Nothing expires within ${span} days`}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{span === 'expired' ? 'Everything in stock is within its date.' : 'Try a longer span to see what is coming up.'}</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                visible.map(({ product, batch, days, value }) => {
                                    const expired = days < 0;
                                    return (
                                        <TableRow key={batch.id}>
                                            <TableCell className="max-w-[20rem]">
                                                <div className="font-medium">{product.name}</div>
                                                {product.composition && <div className="truncate text-xs text-muted-foreground" title={product.composition}>{product.composition}</div>}
                                            </TableCell>
                                            <TableCell><span translate="no" className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{batch.batchNo}</span></TableCell>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                <div>{formatDay(batch.expiryDate)}</div>
                                                <span className={cn(
                                                    'mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium',
                                                    expired ? 'bg-red-600 text-white' : days <= 30 ? 'bg-red-100 text-red-800' : days <= 60 ? 'bg-amber-100 text-amber-800' : 'bg-yellow-100 text-yellow-800',
                                                )}>
                                                    {expiryText(days)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right tabular-nums">{formatQty(batch.qtyStrips, batch.qtyLoose, batch.packSize, batch.packType, batch.packUnit)}</TableCell>
                                            <TableCell>{batch.rackLocation || '—'}</TableCell>
                                            <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(value)}</TableCell>
                                            <TableCell className="text-right">
                                                <PermissionGate permission="adjust_stock">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={expired ? 'destructive' : 'outline'}
                                                        onClick={() => onAdjustClick(batch, product)}
                                                        aria-label={`${expired ? 'Write off' : 'Adjust'} batch ${batch.batchNo} of ${product.name}`}
                                                    >
                                                        <SlidersHorizontal aria-hidden="true" /> {expired ? 'Write Off' : 'Adjust'}
                                                    </Button>
                                                </PermissionGate>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
                {!isLoading && rows.length > 0 && (
                    <TablePagination page={current} totalPages={totalPages} totalRecords={rows.length} pageSize={size} noun="batches" onPage={setPage} onPageSize={(s) => { setSize(s); setPage(1); }} />
                )}
            </div>
        </div>
    );
}
