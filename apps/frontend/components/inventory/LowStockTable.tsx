'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, ListPlus, PackageX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination } from '@/components/shared/TablePagination';
import { ListBanner } from '@/components/inventory/ListBanner';
import { useOutletId } from '@/hooks/useOutletId';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { formatMonth } from '@/lib/dates';
import { exportToCSV } from '@/lib/export';
import { hasExpiry, pluralize, reorderLevel } from '@/lib/inventory';
import { fetchAllStock } from '@/lib/inventoryApi';
import { poApi } from '@/lib/poApi';
import { cn, formatQty } from '@/lib/utils';
import type { ProductSearchResult } from '@/types';

/** Phones show each row as a stacked card (the table elements become blocks / a small grid, so the markup is unchanged). Desktop is the plain table. */
const M_ROW = 'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-start max-md:gap-x-2 max-md:gap-y-1.5 max-md:p-3';
const M_DETAIL = 'max-md:col-span-2 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0 max-md:before:content-[attr(data-label)] max-md:before:text-xs max-md:before:text-muted-foreground';

const packs = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export function LowStockTable({ onReorderClick }: { onReorderClick: () => void }) {
    const outletId = useOutletId();
    const { hasPermission } = usePermissions();
    const { toast } = useToast();
    const canOrder = hasPermission('create_purchases');
    const [added, setAdded] = useState<Set<string>>(new Set());
    const [busyId, setBusyId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(50);

    // Every low-stock product, all pages (the server returns at most 100 per request).
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['inventory', 'low-stock', outletId],
        queryFn: ({ signal }) => fetchAllStock(outletId, { lowStock: true, sortBy: 'stock', sortOrder: 'asc' }, signal),
        enabled: !!outletId,
        staleTime: 1000 * 60 * 2,
    });

    const products = useMemo(() => data?.products ?? [], [data]);
    const outOfStock = useMemo(() => products.filter((p) => (p.totalStock || 0) === 0).length, [products]);
    const totalPages = Math.max(1, Math.ceil(products.length / size));
    const current = Math.min(page, totalPages);
    const visible = products.slice((current - 1) * size, current * size);

    const shortageOf = (p: ProductSearchResult) => Math.max(0, reorderLevel(p as any) - (p.totalStock || 0));

    const addToShortbook = async (p: ProductSearchResult) => {
        setBusyId(p.id);
        try {
            await poApi.shortbookAdd(outletId, { productId: p.id, qty: Math.max(1, Math.ceil(shortageOf(p))), source: 'low_stock' });
            setAdded((s) => new Set(s).add(p.id));
            toast({ title: 'Added to the Shortbook', description: p.name });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Could not add to the Shortbook. Try again.', description: apiErrorMessage(e, 'Something went wrong.') });
        } finally {
            setBusyId(null);
        }
    };

    const exportList = () =>
        exportToCSV(
            products.map((p) => ({
                product: p.name,
                stock: Number((p.totalStock || 0).toFixed(2)),
                // the real per-product level (the old export wrote 10 for everyone)
                level: reorderLevel(p as any),
                shortage: Number(shortageOf(p).toFixed(2)),
                expiry: hasExpiry(p.nearestExpiry) ? p.nearestExpiry : '',
            })),
            'low-stock',
            [
                { key: 'product', label: 'Product' }, { key: 'stock', label: 'In Stock (packs)' }, { key: 'level', label: 'Reorder Level (packs)' },
                { key: 'shortage', label: 'Shortage (packs)' }, { key: 'expiry', label: 'Nearest Expiry' },
            ],
        );

    return (
        <div className="space-y-4">
            <ListBanner
                tone="red"
                icon={<PackageX className="h-5 w-5" />}
                title={isLoading ? 'Checking stock levels…' : `${(data?.totalRecords ?? products.length).toLocaleString('en-IN')} ${products.length === 1 ? 'product is' : 'products are'} below the reorder level`}
                description={isLoading ? undefined : outOfStock > 0 ? `${outOfStock} of them ${outOfStock === 1 ? 'is' : 'are'} out of stock. Order soon to avoid missed sales.` : 'Order soon to avoid missed sales.'}
                actions={
                    <>
                        <Button type="button" variant="outline" size="sm" onClick={exportList} disabled={products.length === 0}><Download aria-hidden="true" /> Export CSV</Button>
                        {canOrder && <Button type="button" size="sm" onClick={onReorderClick}>Create Purchase Order</Button>}
                    </>
                }
            />

            {isError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Couldn&apos;t load low-stock products</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(error, 'Something went wrong.')} Check your connection and try again.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Try Again</Button>
                    </AlertDescription>
                </Alert>
            )}

            <div className="overflow-hidden rounded-xl border bg-card">
                <div className="overflow-x-auto">
                    <Table className="md:min-w-[44rem]">
                        <caption className="sr-only">Products below their reorder level</caption>
                        <TableHeader className="bg-muted/50 max-md:hidden">
                            <TableRow className="hover:bg-transparent">
                                <TableHead scope="col">Product</TableHead>
                                <TableHead scope="col" className="w-56">In Stock</TableHead>
                                <TableHead scope="col" className="text-right">Reorder Level</TableHead>
                                <TableHead scope="col" className="text-right">Shortage</TableHead>
                                <TableHead scope="col">Nearest Expiry</TableHead>
                                <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="max-md:block">
                            {isLoading ? (
                                Array.from({ length: 5 }, (_, i) => <TableRow key={i} className="hover:bg-transparent max-md:block"><TableCell colSpan={6} className="max-md:block"><Skeleton className="h-9 w-full" /></TableCell></TableRow>)
                            ) : visible.length === 0 ? (
                                <TableRow className="hover:bg-transparent max-md:block">
                                    <TableCell colSpan={6} className="py-16 text-center max-md:block max-md:py-12">
                                        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500/60" aria-hidden="true" />
                                        <p className="font-medium">Nothing is running low</p>
                                        <p className="mt-1 text-sm text-muted-foreground">Every product is above its reorder level.</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                visible.map((p) => {
                                    const anyP = p as any;
                                    const level = reorderLevel(anyP);
                                    const qty = p.totalStock || 0;
                                    const fill = Math.min(100, (qty / level) * 100);
                                    const word = pluralize(p.packType || 'pack');
                                    const shortage = shortageOf(p);
                                    const done = added.has(p.id);
                                    return (
                                        <TableRow key={p.id} className={M_ROW}>
                                            <TableCell className="max-w-[20rem] max-md:col-span-2 max-md:min-w-0 max-md:max-w-none max-md:p-0">
                                                <div className="font-medium">{p.name}</div>
                                                {p.composition && <div className="truncate text-xs text-muted-foreground" title={p.composition}>{p.composition}</div>}
                                                {p.manufacturer && <div className="truncate text-xs text-muted-foreground/80">{p.manufacturer}</div>}
                                            </TableCell>
                                            <TableCell className="max-md:col-span-2 max-md:p-0">
                                                <div className={cn('text-lg font-semibold tabular-nums', qty === 0 ? 'text-destructive' : 'text-foreground')}>
                                                    {qty === 0 ? 'Out of stock' : formatQty(anyP.total_qty_strips ?? Math.floor(qty), anyP.totalLoose ?? 0, p.packSize || 1, p.packType || 'strip', p.packUnit || 'tablet')}
                                                </div>
                                                <Progress
                                                    value={fill}
                                                    aria-label={`Stock is ${Math.round(fill)}% of the reorder level`}
                                                    className="mt-2 h-1.5"
                                                />
                                            </TableCell>
                                            <TableCell data-label="Reorder Level" className={cn('whitespace-nowrap text-right tabular-nums text-muted-foreground', M_DETAIL)}>{packs.format(level)} {word}</TableCell>
                                            <TableCell data-label="Shortage" className={cn('whitespace-nowrap text-right font-medium tabular-nums text-destructive', M_DETAIL)}>Need {packs.format(Math.ceil(shortage))} more</TableCell>
                                            <TableCell data-label="Nearest Expiry" className={cn('whitespace-nowrap tabular-nums', M_DETAIL)}>{hasExpiry(p.nearestExpiry) ? formatMonth(p.nearestExpiry) : <span className="text-muted-foreground">—</span>}</TableCell>
                                            <TableCell className="text-right max-md:col-span-2 max-md:p-0">
                                                {canOrder && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant={done ? 'outline' : 'default'}
                                                        disabled={done || busyId === p.id}
                                                        onClick={() => addToShortbook(p)}
                                                        aria-label={done ? `In Shortbook: ${p.name}` : `Add to Shortbook: ${p.name}`}
                                                    >
                                                        <ListPlus aria-hidden="true" /> {done ? 'In Shortbook' : busyId === p.id ? 'Adding…' : 'Add to Shortbook'}
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
                {!isLoading && products.length > 0 && (
                    <TablePagination page={current} totalPages={totalPages} totalRecords={products.length} pageSize={size} noun="products" onPage={setPage} onPageSize={(s) => { setSize(s); setPage(1); }} />
                )}
            </div>
        </div>
    );
}
