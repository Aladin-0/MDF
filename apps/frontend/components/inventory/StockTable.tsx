'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, PackageSearch, Pencil, Search, SlidersHorizontal, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastAction } from '@/components/ui/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { TablePagination } from '@/components/shared/TablePagination';
import { BatchBreakdown } from '@/components/inventory/BatchBreakdown';
import { InlineEditCell, QUICK_EDIT_LABELS, type QuickEditField } from '@/components/inventory/InlineEditCell';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { useStockPage } from '@/hooks/useInventory';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { productsApi } from '@/lib/apiClient';
import { daysUntil, expiryTone, formatDay } from '@/lib/dates';
import { formatCurrency } from '@/lib/gst';
import { expiryText, hasExpiry, productValue } from '@/lib/inventory';
import { INVENTORY_PAGE_SIZES, hasActiveFilters, type SortKey } from '@/lib/inventoryParams';
import { cn, formatQty } from '@/lib/utils';
import { useInventoryStore } from '@/store/inventoryStore';
import type { Batch, MasterProduct, ProductSearchResult } from '@/types';

interface StockTableProps {
    onAdjustClick: (batch: Batch, product: ProductSearchResult) => void;
    onEditClick: (product: MasterProduct) => void;
}

const SEARCH_DELAY_MS = 400;
const ALL = 'all';
const NO_QUICK_EDIT = 'none';

/** Schedule badge colours: classification colours, kept from the old table so staff keep recognising them. */
const SCHEDULE_TONES: Record<string, string> = {
    OTC: 'bg-green-50 text-green-800 border-green-200',
    G: 'bg-blue-50 text-blue-800 border-blue-200',
    H: 'bg-amber-50 text-amber-800 border-amber-200',
    H1: 'bg-orange-50 text-orange-800 border-orange-200',
    X: 'bg-red-50 text-red-800 border-red-200',
    C: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    Narcotic: 'bg-purple-50 text-purple-800 border-purple-200',
    Ayurvedic: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Surgical: 'bg-slate-50 text-slate-800 border-slate-200',
    Cosmetic: 'bg-pink-50 text-pink-800 border-pink-200',
    Veterinary: 'bg-amber-50 text-amber-900 border-amber-200',
};

function SortHeader({ label, sortKey, active, order, onSort, className }: {
    label: string; sortKey: SortKey; active: SortKey; order: 'asc' | 'desc'; onSort: (key: SortKey) => void; className?: string;
}) {
    const isActive = active === sortKey;
    return (
        <TableHead scope="col" aria-sort={isActive ? (order === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {label}
                {isActive ? (order === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />) : null}
            </button>
        </TableHead>
    );
}

export function StockTable({ onAdjustClick, onEditClick }: StockTableProps) {
    const { params, update, clearFilters } = useInventoryFilters();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { valuationMode } = useInventoryStore();
    const topRef = useRef<HTMLDivElement>(null);

    const [quickEdit, setQuickEdit] = useState<QuickEditField | typeof NO_QUICK_EDIT>(NO_QUICK_EDIT);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // ── Search: typed immediately, written to the URL (and so requested) after a pause ──
    const [text, setText] = useState(params.q);
    const pushed = useRef(params.q);
    useEffect(() => {
        if (params.q !== pushed.current) { pushed.current = params.q; setText(params.q); }
    }, [params.q]);
    useEffect(() => {
        if (text.trim() === pushed.current) return;
        const t = setTimeout(() => { pushed.current = text.trim(); update({ q: text }); }, SEARCH_DELAY_MS);
        return () => clearTimeout(t);
    }, [text, update]);

    // ── Data. The server sorts (name, stock, expiry) and pages (max 100); nothing is re-sorted here ──
    const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useStockPage(
        { search: params.q, scheduleType: params.schedule as any, sortBy: params.sort, sortOrder: params.order },
        params.page,
        params.size,
    );
    const rows: ProductSearchResult[] = data?.data ?? [];
    const totalPages = Math.max(1, data?.pagination?.totalPages ?? 1);
    const totalRecords = data?.pagination?.totalRecords ?? 0;
    const filtersOn = hasActiveFilters(params);

    // a page past the end (rows were removed, or an old link) goes to the last page
    useEffect(() => {
        if (data && params.page > totalPages) update({ page: totalPages });
    }, [data, params.page, totalPages, update]);

    const onSort = (key: SortKey) =>
        update(params.sort === key ? { order: params.order === 'asc' ? 'desc' : 'asc' } : { sort: key, order: 'asc' });

    const toggle = (id: string) =>
        setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

    const changePage = (page: number) => {
        update({ page });
        // only when the user pages, not on first load (an effect on `page` used to scroll the whole page down at load)
        requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };

    const saveQuickEdit = useCallback(async (product: MasterProduct, field: QuickEditField, value: string | number) => {
        const previous = (product as any)[field];
        const apply = (v: unknown) => queryClient.setQueriesData({ queryKey: ['inventory', 'stock'] }, (old: any) =>
            old?.data ? { ...old, data: old.data.map((p: any) => (p.id === product.id ? { ...p, [field]: v } : p)) } : old);
        try {
            await productsApi.update(product.id, { [field]: value });
            apply(value);
            toast({
                title: 'Updated',
                description: `${QUICK_EDIT_LABELS[field]} of ${product.name}: ${previous ?? 'none'} → ${value}. Applies to every outlet.`,
                duration: 10000,
                // a mis-click on a dropdown changes live data at once, so there is a way back
                action: (
                    <ToastAction
                        altText="Undo this change"
                        onClick={() => {
                            productsApi.update(product.id, { [field]: previous })
                                .then(() => { apply(previous); queryClient.invalidateQueries({ queryKey: ['inventory'] }); toast({ title: 'Change undone', description: `${product.name} is back as it was.` }); })
                                .catch((e) => toast({ variant: 'destructive', title: 'Could not undo', description: apiErrorMessage(e, 'Edit the product again to put it back.') }));
                        }}
                    >
                        Undo
                    </ToastAction>
                ),
            });
            queryClient.invalidateQueries({ queryKey: ['inventory', 'summary'] });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Not saved', description: apiErrorMessage(e, 'Failed to update') });
            throw e;
        }
    }, [queryClient, toast]);

    const columnCount = 8 + (quickEdit !== NO_QUICK_EDIT ? 1 : 0);

    return (
        <div className="space-y-4" ref={topRef}>
            {/* ── Filters ── */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[14rem] flex-1 space-y-1.5 md:max-w-sm">
                    <Label htmlFor="stock-search" className="text-xs text-muted-foreground">Search</Label>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                            id="stock-search"
                            name="q"
                            type="search"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Medicine, salt or brand…"
                            className="pl-9 [&::-webkit-search-cancel-button]:hidden"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="stock-schedule" className="text-xs text-muted-foreground">Schedule</Label>
                    <Select value={params.schedule || ALL} onValueChange={(v) => update({ schedule: v })}>
                        <SelectTrigger id="stock-schedule" className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All Types</SelectItem>
                            {SCHEDULE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <PermissionGate permission="edit_inventory">
                    <div className="space-y-1.5">
                        <Label htmlFor="stock-quick-edit" className="text-xs text-muted-foreground">Quick edit (all outlets)</Label>
                        <Select value={quickEdit} onValueChange={(v) => setQuickEdit(v as QuickEditField | typeof NO_QUICK_EDIT)}>
                            <SelectTrigger id="stock-quick-edit" className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_QUICK_EDIT}>Off</SelectItem>
                                {(Object.keys(QUICK_EDIT_LABELS) as QuickEditField[]).map((f) => <SelectItem key={f} value={f}>{QUICK_EDIT_LABELS[f]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </PermissionGate>

                {filtersOn && (
                    <Button type="button" variant="ghost" onClick={() => { setText(''); clearFilters(); }}>
                        <X aria-hidden="true" /> Clear Filters
                    </Button>
                )}
            </div>

            {isError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Couldn&apos;t load the stock list</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(error, 'Something went wrong.')} Check your connection and try again.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Try Again</Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* ── Table ── */}
            <div className="overflow-hidden rounded-xl border bg-card">
                <div className="overflow-x-auto" aria-busy={isFetching}>
                    <Table // dim only while the PREVIOUS rows stand in for what the user just asked for (new sort, page or search);
                    // a quiet background refresh (after a save, say) must not make the whole table flash
                    className={cn('min-w-[56rem] transition-opacity', isPlaceholderData && 'opacity-60')}>
                        <caption className="sr-only">Products in stock</caption>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead scope="col" className="w-10"><span className="sr-only">Show batches</span></TableHead>
                                <SortHeader label="Product" sortKey="name" active={params.sort} order={params.order} onSort={onSort} className="min-w-[14rem]" />
                                <TableHead scope="col">Schedule</TableHead>
                                {quickEdit !== NO_QUICK_EDIT && <TableHead scope="col">{QUICK_EDIT_LABELS[quickEdit]}</TableHead>}
                                <SortHeader label="Stock" sortKey="stock" active={params.sort} order={params.order} onSort={onSort} className="text-right" />
                                <TableHead scope="col" className="text-center">Batches</TableHead>
                                <SortHeader label="Nearest Expiry" sortKey="expiry" active={params.sort} order={params.order} onSort={onSort} />
                                <TableHead scope="col" className="text-right">Value</TableHead>
                                <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 8 }, (_, i) => (
                                    <TableRow key={i} className="hover:bg-transparent"><TableCell colSpan={columnCount}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
                                ))
                            ) : rows.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={columnCount} className="py-20 text-center">
                                        <PackageSearch className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                                        <p className="font-medium">{filtersOn ? 'No products match your filters' : 'No products in stock yet'}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{filtersOn ? 'Try a different search or clear the filters.' : 'Stock appears here once a purchase has been received.'}</p>
                                        {filtersOn && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { setText(''); clearFilters(); }}>Clear Filters</Button>}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((p) => {
                                    const open = expanded.has(p.id);
                                    const empty = (p.totalStock || 0) === 0;
                                    const anyP = p as any;
                                    const stockText = formatQty(anyP.total_qty_strips ?? Math.floor(p.totalStock || 0), anyP.totalLoose ?? 0, p.packSize || 1, p.packType || 'strip', p.packUnit || 'tablet');
                                    const expiry = hasExpiry(p.nearestExpiry) ? p.nearestExpiry : null;
                                    const tone = expiry ? expiryTone(expiry) : null;
                                    const days = expiry ? daysUntil(expiry) : null;
                                    return (
                                        <React.Fragment key={p.id}>
                                            <TableRow className={cn(open && 'bg-muted/30')}>
                                                <TableCell className="w-10 pr-0">
                                                    {p.batches.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggle(p.id)}
                                                            aria-expanded={open}
                                                            aria-label={`${open ? 'Hide' : 'Show'} ${p.batches.length} batches of ${p.name}`}
                                                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        >
                                                            {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                                                        </button>
                                                    )}
                                                </TableCell>
                                                <TableCell className="min-w-[14rem] max-w-[22rem]">
                                                    <Link href={`/dashboard/inventory/${p.id}`} className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                                                        {p.name}
                                                    </Link>
                                                    {p.composition && <div className="truncate text-xs text-muted-foreground" title={p.composition}>{p.composition}</div>}
                                                    {p.manufacturer && <div className="truncate text-xs text-muted-foreground/80">{p.manufacturer}</div>}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={cn('inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold', SCHEDULE_TONES[p.scheduleType] ?? 'bg-muted text-foreground')}>{p.scheduleType}</span>
                                                </TableCell>
                                                {quickEdit !== NO_QUICK_EDIT && (
                                                    <TableCell>
                                                        <InlineEditCell product={p} field={quickEdit} onSave={(v) => saveQuickEdit(p, quickEdit, v)} />
                                                    </TableCell>
                                                )}
                                                <TableCell className="whitespace-nowrap text-right tabular-nums">
                                                    {empty ? <span className="font-medium text-destructive">Out of stock</span> : (
                                                        <span className={cn('font-medium', p.isLowStock && 'text-destructive')}>
                                                            {stockText}
                                                            {p.isLowStock && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">Low</span>}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center tabular-nums text-muted-foreground">{p.batches.length}</TableCell>
                                                <TableCell className="whitespace-nowrap tabular-nums">
                                                    {expiry && days !== null ? (
                                                        <div>
                                                            <div>{formatDay(expiry)}</div>
                                                            {tone !== 'ok' && (
                                                                <div className={cn('text-xs font-medium', tone === 'expired' ? 'text-destructive' : 'text-amber-700')}>{expiryText(days)}</div>
                                                            )}
                                                        </div>
                                                    ) : <span className="text-muted-foreground">—</span>}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">
                                                    {formatCurrency(productValue(p.batches, valuationMode, p.packSize || 1))}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button asChild type="button" variant="ghost" size="icon" className="h-8 w-8">
                                                            <Link href={`/dashboard/inventory/${p.id}`} aria-label={`View details of ${p.name}`} title="View details"><Eye aria-hidden="true" /></Link>
                                                        </Button>
                                                        <PermissionGate permission="edit_inventory">
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditClick(p as unknown as MasterProduct)} aria-label={`Edit ${p.name}`} title="Edit product">
                                                                <Pencil aria-hidden="true" />
                                                            </Button>
                                                        </PermissionGate>
                                                        <PermissionGate permission="adjust_stock">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                disabled={p.batches.length === 0}
                                                                onClick={() => onAdjustClick(p.batches.find((b) => b.qtyStrips > 0 || b.qtyLoose > 0) ?? p.batches[0], p)}
                                                                aria-label={`Adjust stock of ${p.name}`}
                                                                title="Adjust stock"
                                                            >
                                                                <SlidersHorizontal aria-hidden="true" />
                                                            </Button>
                                                        </PermissionGate>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                            {open && (
                                                <TableRow className="hover:bg-transparent">
                                                    <TableCell colSpan={columnCount} className="border-l-4 border-l-primary bg-muted/20 p-4">
                                                        <BatchBreakdown product={p} onAdjust={onAdjustClick} />
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {!isLoading && totalRecords > 0 && (
                    <TablePagination
                        page={Math.min(params.page, totalPages)}
                        totalPages={totalPages}
                        totalRecords={totalRecords}
                        pageSize={params.size}
                        pageSizes={INVENTORY_PAGE_SIZES}
                        noun="products"
                        busy={isFetching}
                        onPage={changePage}
                        onPageSize={(size) => update({ size })}
                    />
                )}
            </div>
        </div>
    );
}
