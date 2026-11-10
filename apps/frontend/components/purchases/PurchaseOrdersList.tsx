'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronsUpDown, ClipboardList, Copy, MessageCircle, MoreHorizontal, PackageCheck, Phone, Search, Send, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useDebounce } from '@/hooks/useDebounce';
import { useDistributors } from '@/hooks/usePurchases';
import { useInvalidatePO, usePODistributors, usePOItems, usePOList } from '@/hooks/usePO';
import { useOutletId } from '@/hooks/useOutletId';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { poApi, money, type POSummary } from '@/lib/poApi';
import { cn } from '@/lib/utils';
import { POStatusBadge } from './po/POStatusBadge';
import { POConfirmModal } from './po/POConfirmModal';

const VIEWS = [{ id: 'orders', label: 'Orders' }, { id: 'items', label: 'Items' }, { id: 'distributors', label: 'Distributors' }] as const;
const CHIPS = [
    { id: 'OPEN', label: 'Open' }, { id: 'SAVED', label: 'Draft' }, { id: 'SENT', label: 'Sent' }, { id: 'PARTIAL', label: 'Partial' },
    { id: 'COMPLETED', label: 'Completed' }, { id: 'CANCELLED', label: 'Cancelled' }, { id: 'EXPIRED', label: 'Expired' }, { id: 'ALL', label: 'All' },
];
const VIA_ICON: Record<string, typeof Send> = { whatsapp_link: MessageCircle, pdf_whatsapp: MessageCircle, email: Send, manual: Phone };

export function PurchaseOrdersList() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const { toast } = useToast();
    const outletId = useOutletId();
    const { hasPermission } = usePermissions();
    const invalidate = useInvalidatePO();
    const canCreate = hasPermission('create_purchases');
    const canSend = hasPermission('send_purchase_orders');
    const canCancel = hasPermission('cancel_purchase_orders');

    // Filters live in the URL so a refresh, a shared link and the back button all keep them
    const view = (params.get('view') as 'orders' | 'items' | 'distributors') || 'orders';
    const status = params.get('status') || 'OPEN';
    const page = Number(params.get('page') || 1);
    const pageSize = Number(params.get('pageSize') || 25);
    const dist = params.get('dist') || 'ALL';
    const [search, setSearch] = useState(params.get('q') || '');
    const debounced = useDebounce(search, 300);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [distOpen, setDistOpen] = useState(false);
    const [cancelFor, setCancelFor] = useState<POSummary | null>(null);

    const setParam = (patch: Record<string, string | null>) => {
        const next = new URLSearchParams(params.toString());
        Object.entries(patch).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)));
        if (!('page' in patch)) next.delete('page');
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    };

    const { data: distributors } = useDistributors();
    const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
    const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
    const filters = useMemo(() => ({ search: debounced, distributorId: dist, startDate, endDate, status, page, pageSize }), [debounced, dist, startDate, endDate, status, page, pageSize]);

    const orders = usePOList(filters);
    const items = usePOItems({ search: debounced, status, page, pageSize }, view === 'items');
    const byDist = usePODistributors(view === 'distributors');
    const hasFilters = !!(search || dist !== 'ALL' || startDate || endDate);
    const clear = () => { setSearch(''); setDateRange(undefined); setParam({ q: null, dist: null }); };

    const duplicate = async (po: POSummary) => {
        try { const c = await poApi.duplicate(outletId!, po.id); invalidate(); toast({ title: 'Copied', description: `${c.poNumber} created as a draft.` }); router.push(`/dashboard/purchases/orders/${c.id}`); }
        catch (e: any) { toast({ variant: 'destructive', title: 'Could not duplicate', description: e.message }); }
    };

    const counts = orders.data?.statusCounts ?? {};
    const pag = (view === 'orders' ? orders.data?.pagination : view === 'items' ? items.data?.pagination : undefined);

    return (
        <div className="space-y-4">
            {/* View switch + new */}
            <div className="flex flex-wrap items-center gap-3">
                <div role="tablist" aria-label="Purchase order view" className="inline-flex h-10 items-center rounded-md bg-muted p-1 text-muted-foreground">
                    {VIEWS.map((v) => (
                        <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setParam({ view: v.id === 'orders' ? null : v.id })}
                            className={cn('rounded-sm px-3 py-1.5 text-sm font-medium transition-all', view === v.id ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground')}>{v.label}</button>
                    ))}
                </div>
            </div>

            {/* Search + filters */}
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input aria-label="Search purchase orders" placeholder={view === 'items' ? 'Product or PO number' : 'PO number or distributor'} className="w-full bg-white pl-9"
                        value={search} onChange={(e) => { setSearch(e.target.value); setParam({ q: e.target.value || null }); }} />
                </div>
                {view === 'orders' && (
                    <>
                        <Popover open={distOpen} onOpenChange={setDistOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={distOpen} className="w-full justify-between bg-white font-normal md:w-[240px]">
                                    {dist === 'ALL' ? 'All distributors' : distributors?.find((d: any) => d.id === dist)?.name || 'Distributor'}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[240px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search distributor..." />
                                    <CommandList>
                                        <CommandEmpty>No distributor found.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem value="ALL" onSelect={() => { setParam({ dist: null }); setDistOpen(false); }}><Check className={cn('mr-2 h-4 w-4', dist === 'ALL' ? 'opacity-100' : 'opacity-0')} />All distributors</CommandItem>
                                            {distributors?.map((d: any) => (
                                                <CommandItem key={d.id} value={d.name} onSelect={() => { setParam({ dist: d.id }); setDistOpen(false); }}>
                                                    <Check className={cn('mr-2 h-4 w-4', dist === d.id ? 'opacity-100' : 'opacity-0')} />{d.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <div className="md:w-auto"><DatePickerWithRange date={dateRange} setDate={setDateRange} /></div>
                    </>
                )}
                {hasFilters && <Button variant="ghost" onClick={clear}><XCircle className="mr-2 h-4 w-4" />Clear</Button>}
            </div>

            {/* Status chips with counts */}
            {view !== 'distributors' && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                    {CHIPS.map((c) => {
                        const active = status === c.id;
                        const n = counts[c.id];
                        return (
                            <button key={c.id} type="button" aria-pressed={active} onClick={() => setParam({ status: c.id === 'OPEN' ? null : c.id })}
                                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-white hover:bg-muted')}>
                                {c.label}{n !== undefined && <span className={cn('rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>{n}</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Orders ── */}
            {view === 'orders' && (orders.isLoading ? <ListSkeleton /> : !orders.data || orders.data.results.length === 0 ? (
                <Empty hasFilters={hasFilters || status !== 'OPEN'} onClear={() => { clear(); setParam({ status: null }); }} />
            ) : (
                <>
                    <div className="hidden overflow-hidden rounded-md border bg-white shadow-sm md:block">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>PO number</TableHead><TableHead>Date</TableHead><TableHead>Distributor</TableHead>
                                    <TableHead className="text-center">Items</TableHead><TableHead className="w-[150px]">Received</TableHead>
                                    <TableHead className="text-right">Amount</TableHead><TableHead>Expected</TableHead><TableHead className="w-[120px]">Status</TableHead><TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.data.results.map((po) => {
                                    const Via = VIA_ICON[po.sentVia];
                                    const pct = po.orderedQty ? Math.min(100, Math.round((po.receivedQty / po.orderedQty) * 100)) : 0;
                                    return (
                                        <TableRow key={po.id} className="hover:bg-slate-50/60">
                                            <TableCell><Link href={`/dashboard/purchases/orders/${po.id}`} className="font-semibold text-primary hover:underline">{po.poNumber}</Link></TableCell>
                                            <TableCell className="text-muted-foreground">{format(new Date(po.orderDate), 'dd MMM yyyy')}</TableCell>
                                            <TableCell className="font-medium">{po.distributorName}</TableCell>
                                            <TableCell className="text-center">{po.itemCount}</TableCell>
                                            <TableCell>
                                                {po.status === 'SAVED' ? <span className="text-muted-foreground">—</span> : (
                                                    <div className="flex items-center gap-2" title={`${po.receivedQty} of ${po.orderedQty} packs`}>
                                                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                                                        <span className="text-xs text-muted-foreground">{po.receivedQty}/{po.orderedQty}</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">{money(po.totalAmount)}</TableCell>
                                            <TableCell className={cn(po.overdue ? 'font-semibold text-red-600' : 'text-muted-foreground')}>{po.expectedDate ? format(new Date(po.expectedDate), 'dd MMM') : '—'}</TableCell>
                                            <TableCell><div className="flex items-center gap-2"><POStatusBadge status={po.status} />{Via && <Via className="h-3.5 w-3.5 text-muted-foreground" aria-label={`Sent via ${po.sentVia}`} />}</div></TableCell>
                                            <TableCell><RowMenu po={po} canCreate={canCreate} canSend={canSend} canCancel={canCancel} onDuplicate={duplicate} onCancel={setCancelFor} /></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    {/* mobile cards */}
                    <div className="space-y-3 md:hidden">
                        {orders.data.results.map((po) => (
                            <Link key={po.id} href={`/dashboard/purchases/orders/${po.id}`} className="block rounded-xl border bg-white p-3 shadow-sm">
                                <div className="flex items-center justify-between"><span className="font-semibold text-primary">{po.poNumber}</span><POStatusBadge status={po.status} /></div>
                                <p className="mt-1 text-sm font-medium">{po.distributorName}</p>
                                <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                                    <span>{format(new Date(po.orderDate), 'dd MMM yyyy')} · {po.itemCount} items{po.status !== 'SAVED' ? ` · ${po.receivedQty}/${po.orderedQty} received` : ''}</span>
                                    <span className="font-semibold text-foreground">{money(po.totalAmount)}</span>
                                </div>
                                {po.overdue && <p className="mt-1 text-xs font-semibold text-red-600">Overdue</p>}
                            </Link>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground"><b className="text-foreground">{orders.data.totals.count}</b> orders · <b className="text-foreground">{money(orders.data.totals.amount)}</b></span>
                        <Pager pag={pag} pageSize={pageSize} onPage={(p) => setParam({ page: String(p) })} onSize={(s) => setParam({ pageSize: String(s), page: null })} />
                    </div>
                </>
            ))}

            {/* ── Items ── */}
            {view === 'items' && (items.isLoading ? <ListSkeleton /> : !items.data || items.data.results.length === 0 ? (
                <Empty hasFilters={!!search || status !== 'OPEN'} onClear={() => { clear(); setParam({ status: null }); }} message="No order lines match. Items on open orders show here, so you can answer “did I order Paracetamol?”" />
            ) : (
                <>
                    <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
                        <Table>
                            <TableHeader className="bg-slate-50"><TableRow><TableHead>Product</TableHead><TableHead>PO</TableHead><TableHead>Distributor</TableHead><TableHead className="text-center">Ordered</TableHead><TableHead className="text-center">Received</TableHead><TableHead className="text-center">Remaining</TableHead><TableHead className="text-center">Age</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {items.data.results.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-medium">{r.productName}</TableCell>
                                        <TableCell><Link href={`/dashboard/purchases/orders/${r.poId}`} className="font-semibold text-primary hover:underline">{r.poNumber}</Link></TableCell>
                                        <TableCell>{r.distributorName}</TableCell>
                                        <TableCell className="text-center">{r.ordered}</TableCell><TableCell className="text-center">{r.received}</TableCell>
                                        <TableCell className={cn('text-center font-semibold', r.remaining ? 'text-amber-700' : 'text-emerald-700')}>{r.remaining}</TableCell>
                                        <TableCell className="text-center text-muted-foreground">{r.ageDays}d</TableCell>
                                        <TableCell><POStatusBadge status={r.status} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end"><Pager pag={pag} pageSize={pageSize} onPage={(p) => setParam({ page: String(p) })} onSize={(s) => setParam({ pageSize: String(s), page: null })} /></div>
                </>
            ))}

            {/* ── Distributors ── */}
            {view === 'distributors' && (byDist.isLoading ? <ListSkeleton /> : !byDist.data || byDist.data.results.length === 0 ? (
                <Empty hasFilters={false} onClear={() => undefined} message="No open orders with any distributor." />
            ) : (
                <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
                    <Table>
                        <TableHeader className="bg-slate-50"><TableRow><TableHead>Distributor</TableHead><TableHead className="text-center">Open orders</TableHead><TableHead className="text-right">Open value</TableHead><TableHead className="text-center">Overdue</TableHead><TableHead>Last sent</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {byDist.data.results.map((d) => (
                                <TableRow key={d.distributorId} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setParam({ view: null, dist: d.distributorId })}>
                                    <TableCell className="font-medium">{d.distributorName}</TableCell>
                                    <TableCell className="text-center">{d.openOrders}</TableCell>
                                    <TableCell className="text-right font-semibold">{money(d.openValue)}</TableCell>
                                    <TableCell className={cn('text-center', d.overdue ? 'font-semibold text-red-600' : 'text-muted-foreground')}>{d.overdue || '—'}</TableCell>
                                    <TableCell className="text-muted-foreground">{d.lastSent ? format(new Date(d.lastSent), 'dd MMM, hh:mm a') : '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ))}

            <POConfirmModal open={!!cancelFor} onClose={() => setCancelFor(null)} title={`Cancel ${cancelFor?.poNumber ?? ''}?`} confirmLabel="Cancel order" destructive reasonLabel="Reason"
                message={<p>Everything not yet received goes back to the Shortbook as pending.</p>}
                onConfirm={async (reason) => { await poApi.cancel(outletId!, cancelFor!.id, reason); invalidate(); toast({ title: 'Order cancelled' }); }} />
        </div>
    );
}

function RowMenu({ po, canCreate, canSend, canCancel, onDuplicate, onCancel }: { po: POSummary; canCreate: boolean; canSend: boolean; canCancel: boolean; onDuplicate: (p: POSummary) => void; onCancel: (p: POSummary) => void }) {
    const router = useRouter();
    const open = `/dashboard/purchases/orders/${po.id}`;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${po.poNumber}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push(open)}>Open</DropdownMenuItem>
                {po.status === 'SAVED' && canSend && <DropdownMenuItem onClick={() => router.push(`${open}?send=1`)}><Send className="mr-2 h-4 w-4" />Send</DropdownMenuItem>}
                {(po.status === 'SENT' || po.status === 'PARTIAL') && canCreate && <DropdownMenuItem onClick={() => router.push(`/dashboard/purchases?tab=new&poId=${po.id}`)}><PackageCheck className="mr-2 h-4 w-4" />Receive goods</DropdownMenuItem>}
                {canCreate && <DropdownMenuItem onClick={() => onDuplicate(po)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>}
                {canCancel && (po.status === 'SAVED' || po.status === 'SENT') && (<><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onClick={() => onCancel(po)}>Cancel order</DropdownMenuItem></>)}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function Pager({ pag, pageSize, onPage, onSize }: { pag?: { page: number; totalPages: number; totalRecords: number }; pageSize: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
    if (!pag) return null;
    return (
        <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-muted-foreground">Rows
                <select aria-label="Rows per page" className="h-8 rounded-md border border-input bg-background px-2" value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
                    {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
            </label>
            <span className="text-muted-foreground">Page {pag.page} of {pag.totalPages}</span>
            <Button variant="outline" size="sm" disabled={pag.page <= 1} onClick={() => onPage(pag.page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={pag.page >= pag.totalPages} onClick={() => onPage(pag.page + 1)}>Next</Button>
        </div>
    );
}

function ListSkeleton() {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
}

function Empty({ hasFilters, onClear, message }: { hasFilters: boolean; onClear: () => void; message?: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
            <ClipboardList className="mb-4 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-medium">{hasFilters ? 'No purchase orders match' : 'No purchase orders yet'}</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {message ?? (hasFilters ? 'Try another status or clear the filters.' : 'Start from the Shortbook: tick what you need and create orders, one per distributor. Or press New PO to build one by hand.')}
            </p>
            {hasFilters ? (
                <Button variant="outline" className="mt-5" onClick={onClear}><XCircle className="mr-2 h-4 w-4" />Clear filters</Button>
            ) : (
                <Button variant="outline" className="mt-5" asChild><Link href="/dashboard/purchases?tab=shortbook">Open the Shortbook</Link></Button>
            )}
        </div>
    );
}
