'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, ClipboardList, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { DistributorCombobox } from '@/components/shared/DistributorCombobox';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { ProductSearchDropdown } from '@/components/inventory/ProductSearchDropdown';
import { POConfirmModal } from './po/POConfirmModal';
import { useDebounce } from '@/hooks/useDebounce';
import { useDistributorList } from '@/hooks/usePurchases';
import { useInvalidatePO, useShortbookGroupItems, useShortbookGroups, useShortbookProductInfo } from '@/hooks/usePO';
import { useOutletId } from '@/hooks/useOutletId';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { poApi, money, type PageInfo, type ShortbookGroup, type ShortbookRow } from '@/lib/poApi';
import { cn } from '@/lib/utils';

const SOURCES = [{ id: 'ALL', label: 'All sources' }, { id: 'low_stock', label: 'Low stock' }, { id: 'billing', label: 'Billing' }, { id: 'customer', label: 'Customer' }, { id: 'manual', label: 'Manual' }];
const STATUSES = [{ id: 'OPEN', label: 'All open' }, { id: 'PENDING', label: 'Pending' }, { id: 'IN_DRAFT', label: 'In draft PO' }, { id: 'ORDERED', label: 'Ordered' }];
const SOURCE_STYLE: Record<string, string> = { low_stock: 'bg-amber-50 text-amber-700 border-amber-200', billing: 'bg-blue-50 text-blue-700 border-blue-200', customer: 'bg-purple-50 text-purple-700 border-purple-200', manual: 'bg-slate-50 text-slate-600 border-slate-200' };
const GROUPS_PER_PAGE = 10;      // distributor groups per page
const ITEMS_PER_PAGE = 25;       // items per page inside one open group

/** Below md each table row becomes a card: checkbox | product | remove on top, then one "label ... value" line per field (labels come from data-label). */
const M_ROW = 'max-md:grid max-md:grid-cols-[1.5rem_minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1.5 max-md:p-3';
const M_DETAIL = 'max-md:col-span-2 max-md:col-start-2 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:p-0 max-md:text-right max-md:before:content-[attr(data-label)] max-md:before:text-xs max-md:before:text-muted-foreground';

type Filters = { search: string; source: string; status: string };
type Distributors = { id: string; name: string }[] | undefined;

function Pager({ info, noun, onPage, busy }: { info: PageInfo; noun: string; onPage: (p: number) => void; busy?: boolean }) {
    if (info.totalPages <= 1) return null;
    const from = (info.page - 1) * info.pageSize + 1;
    const to = Math.min(info.page * info.pageSize, info.totalRecords);
    return (
        <nav aria-label={`${noun} pages`} className="flex flex-col gap-2 px-4 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span>{from}–{to} of {info.totalRecords} {noun}{info.totalRecords > 1 ? 's' : ''}</span>
            <span className="flex items-center justify-between gap-2 max-sm:w-full">
                <Button variant="outline" size="sm" disabled={info.page <= 1 || busy} onClick={() => onPage(info.page - 1)}>Previous</Button>
                <span>Page {info.page} of {info.totalPages}</span>
                <Button variant="outline" size="sm" disabled={info.page >= info.totalPages || busy} onClick={() => onPage(info.page + 1)}>Next</Button>
            </span>
        </nav>
    );
}

interface RowsProps {
    group: ShortbookGroup; filters: Filters; canCreate: boolean; distributors: Distributors;
    ticked: Map<string, ShortbookRow>; allSelected: boolean;
    onToggle: (r: ShortbookRow) => void; onPatch: (r: ShortbookRow, b: { qtyNeeded?: number; distributorId?: string }) => void; onRemove: (r: ShortbookRow) => void;
}

/** The items of ONE open group, one page at a time. Mounted only while the group is open, so closed groups cost nothing. */
const GroupItems = memo(function GroupItems({ group, filters, canCreate, distributors, ticked, allSelected, onToggle, onPatch, onRemove }: RowsProps) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isFetching } = useShortbookGroupItems(group.key, { ...filters, source: filters.source === 'ALL' ? '' : filters.source, page, pageSize: ITEMS_PER_PAGE });
    const rows = data?.results ?? [];
    if (isLoading) return <div className="space-y-2 p-4" aria-label={`Loading ${group.name}`}><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
    if (rows.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground">Nothing in this group matches.</p>;
    return (
        <>
            <div className={cn('overflow-x-auto transition-opacity', isFetching && 'opacity-60')}>
                <table className="w-full text-sm max-md:block">
                    <thead className="bg-white text-left text-xs uppercase tracking-wide text-muted-foreground max-md:hidden"><tr>
                        <th className="w-10 px-3 py-2" /><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-center">Stock</th><th className="px-3 py-2 text-center">Min</th><th className="px-3 py-2 text-center">On order</th>
                        <th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2">Distributor</th><th className="px-3 py-2">Source</th><th className="px-3 py-2 text-right">Last rate</th><th className="px-3 py-2">Status</th><th className="w-10" />
                    </tr></thead>
                    <tbody className="divide-y max-md:block">
                        {rows.map((r) => {
                            const pending = r.status === 'PENDING';
                            return (
                                <tr key={r.id} className={cn(M_ROW, !pending && 'bg-slate-50/60 text-muted-foreground')}>
                                    <td className="px-3 py-2 max-md:col-start-1 max-md:row-start-1 max-md:p-0 max-md:pt-0.5">{canCreate && pending && <input type="checkbox" aria-label={`Select ${r.productName}`} className="accent-primary max-md:h-5 max-md:w-5" checked={allSelected || ticked.has(r.id)} disabled={allSelected} onChange={() => onToggle(r)} />}</td>
                                    <td className="px-3 py-2 max-md:col-start-2 max-md:row-start-1 max-md:min-w-0 max-md:break-words max-md:p-0"><div className="font-medium text-foreground">{r.productName}</div><div className="text-xs text-muted-foreground">{r.packLabel}{r.customerName ? ` · for ${r.customerName}` : ''}{r.note ? ` · ${r.note}` : ''}</div></td>
                                    <td data-label="Stock" className={cn('px-3 py-2 text-center', M_DETAIL)}>{r.currentStock}</td><td data-label="Min" className={cn('px-3 py-2 text-center', M_DETAIL)}>{r.minQty}</td><td data-label="On order" className={cn('px-3 py-2 text-center', M_DETAIL)}>{r.onOrder || '—'}</td>
                                    <td data-label="Qty" className={cn('px-3 py-2 text-center', M_DETAIL)}>{pending && canCreate ? <Input aria-label={`Quantity for ${r.productName}`} type="number" min={1} defaultValue={r.qtyNeeded} key={`${r.id}-${r.qtyNeeded}`} className="mx-auto h-8 w-20 text-center max-md:mx-0 max-md:h-9" onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v !== r.qtyNeeded) onPatch(r, { qtyNeeded: v }); }} /> : r.qtyNeeded}</td>
                                    <td data-label="Distributor" className={cn('px-3 py-2', M_DETAIL)}>{pending && canCreate ? (
                                        <DistributorCombobox value={r.distributorId ?? ''} onChange={(v) => v && onPatch(r, { distributorId: v })} distributors={distributors} ariaLabel={`Distributor for ${r.productName}`} placeholder="Choose…" className={cn('h-8 w-44 text-sm max-md:h-9 max-md:w-52 max-md:max-w-[65vw]', !r.distributorId && 'border-amber-400')} />
                                    ) : (r.distributorName ?? '—')}</td>
                                    <td data-label="Source" className={cn('px-3 py-2', M_DETAIL)}><span className={cn('rounded-full border px-2 py-0.5 text-xs', SOURCE_STYLE[r.source])}>{r.sourceLabel}</span></td>
                                    <td data-label="Last rate" className={cn('px-3 py-2 text-right', M_DETAIL)}>{r.lastRate ? money(r.lastRate) : '—'}</td>
                                    <td data-label="Status" className={cn('px-3 py-2 text-xs', M_DETAIL)}>{r.statusLabel}</td>
                                    <td className="px-3 py-2 max-md:col-start-3 max-md:row-start-1 max-md:p-0">{pending && canCreate && <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 max-md:h-9 max-md:w-9" aria-label={`Remove ${r.productName}`} onClick={() => onRemove(r)}><Trash2 className="h-4 w-4" /></Button>}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {data && <Pager info={data.pagination} noun="item" onPage={setPage} busy={isFetching} />}
        </>
    );
});

/**
 * What needs ordering. The screen loads a short list of distributor groups (counts only), and an opened group loads its own items
 * a page at a time, so a Shortbook with hundreds of rows opens as fast as one with five. Tick items (or a whole group), then Create POs.
 */
export function ShortbookTab() {
    const router = useRouter();
    const { toast } = useToast();
    const outletId = useOutletId();
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission('create_purchases');
    const invalidate = useInvalidatePO();
    const { data: distributors } = useDistributorList();

    const [search, setSearch] = useState('');
    const q = useDebounce(search, 300);
    const [source, setSource] = useState('ALL');
    const [status, setStatus] = useState('OPEN');
    const filters: Filters = useMemo(() => ({ search: q, source, status }), [q, source, status]);
    const filterKey = `${q}|${source}|${status}`;

    const [gPage, setGPage] = useState(1);
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [autoOpened, setAutoOpened] = useState(false);
    const [ticked, setTicked] = useState<Map<string, ShortbookRow>>(new Map());      // single items picked by hand
    const [wholeGroups, setWholeGroups] = useState<Map<string, ShortbookGroup>>(new Map());   // groups picked as a whole ("all N pending")
    const [removeOpen, setRemoveOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // a new filter starts again at the first page of groups
    useEffect(() => { setGPage(1); setAutoOpened(false); setOpen(new Set()); }, [filterKey]);

    const { data, isLoading, isFetching } = useShortbookGroups({ search: q, source: source === 'ALL' ? '' : source, status, page: gPage, pageSize: GROUPS_PER_PAGE });
    const groups = data?.groups ?? [];

    // open the first group by default so the screen is not just a list of closed headers
    useEffect(() => {
        if (!autoOpened && groups.length) { setOpen(new Set([groups[0].key])); setAutoOpened(true); }
    }, [groups, autoOpened]);

    const toggleOpen = (key: string) => setOpen((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const toggleRow = (r: ShortbookRow) => setTicked((m) => { const n = new Map(m); n.has(r.id) ? n.delete(r.id) : n.set(r.id, r); return n; });
    const toggleGroup = (g: ShortbookGroup) => {
        setWholeGroups((m) => { const n = new Map(m); n.has(g.key) ? n.delete(g.key) : n.set(g.key, g); return n; });
        setTicked((m) => { const n = new Map(m); n.forEach((r, id) => { if ((r.distributorId ?? 'none') === g.key) n.delete(id); }); return n; });     // the group covers them
    };

    const wholeList = Array.from(wholeGroups.values());
    const itemIds = Array.from(ticked.values()).filter((r) => r.status === 'PENDING').map((r) => r.id);
    const itemCount = itemIds.length + wholeList.reduce((s, g) => s + g.pending, 0);
    const distributorCount = new Set([...Array.from(ticked.values()).map((r) => r.distributorId ?? 'none'), ...wholeList.map((g) => g.key)]).size;
    const selectedValue = Array.from(ticked.values()).reduce((s, r) => s + r.qtyNeeded * Number(r.lastRate || 0), 0);     // only known for hand-picked rows
    const clearSelection = () => { setTicked(new Map()); setWholeGroups(new Map()); };

    const run = async (fn: () => Promise<unknown>, ok?: string) => {
        setBusy(true); setError(null);
        try { await fn(); invalidate(); if (ok) toast({ title: ok }); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    const patch = (r: ShortbookRow, body: { qtyNeeded?: number; distributorId?: string }) => run(() => poApi.shortbookPatch(outletId!, r.id, body));
    const remove = (r: ShortbookRow) => run(() => poApi.shortbookRemove(outletId!, r.id));

    const createPOs = async () => {
        setBusy(true); setError(null);
        try {
            const res = await poApi.shortbookCreatePOs(outletId!, itemIds, wholeList.map((g) => g.distributorId).filter(Boolean) as string[]);
            invalidate(); clearSelection();
            toast({ title: `${res.created.length} draft PO${res.created.length > 1 ? 's' : ''} created`, description: res.created.map((c) => `${c.poNumber} · ${c.distributorName}`).join('\n') });
            router.push(`/dashboard/purchases/orders/${res.created[0].id}`);
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    const counts = data?.counts;
    return (
        <div className="space-y-4 pb-32 sm:pb-24">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="Search the Shortbook" placeholder="Search a product" className="bg-white pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <select aria-label="Source" className="h-10 w-full rounded-md md:w-auto border border-input bg-white px-3 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <select aria-label="Status" className="h-10 w-full rounded-md md:w-auto border border-input bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </div>
            {counts && <p className="text-sm text-muted-foreground" data-testid="shortbook-counts"><b className="text-foreground">{counts.pending}</b> pending · {counts.inDraft} in draft POs · {counts.ordered} ordered</p>}

            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {isLoading ? <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : groups.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border bg-white px-4 py-16 text-center">
                    <ClipboardList className="mb-4 h-12 w-12 text-slate-300" />
                    <h3 className="text-lg font-medium">Nothing to order</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">Items appear here when stock drops below its minimum (turn that on in Purchase order settings), when a bill runs short, or when you add them.</p>
                </div>
            ) : (
                <div className={cn('space-y-3 transition-opacity', isFetching && 'opacity-70')}>
                    {groups.map((g) => {
                        const isOpen = open.has(g.key);
                        const whole = wholeGroups.has(g.key);
                        return (
                            <section key={g.key} className="overflow-hidden rounded-xl border bg-white shadow-sm" data-testid={`group-${g.key}`}>
                                <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-4 py-2.5">
                                    {canCreate && g.pending > 0 && g.key !== 'none' && <input type="checkbox" aria-label={`Select all for ${g.name}`} className="accent-primary" checked={whole} onChange={() => toggleGroup(g)} />}
                                    <button type="button" aria-expanded={isOpen} aria-controls={`group-body-${g.key}`} onClick={() => toggleOpen(g.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                                        <h3 className="truncate font-semibold">{g.name}</h3>
                                        <span className="shrink-0 text-sm text-muted-foreground">{g.items} item{g.items > 1 ? 's' : ''}{g.pending !== g.items ? ` · ${g.pending} pending` : ''}</span>
                                    </button>
                                    {whole && <span className="text-xs font-medium text-primary">All {g.pending} pending selected</span>}
                                </div>
                                {isOpen && (
                                    <div id={`group-body-${g.key}`} className="border-t">
                                        <GroupItems key={`${g.key}|${filterKey}`} group={g} filters={filters} canCreate={canCreate} distributors={distributors} ticked={ticked} allSelected={whole}
                                            onToggle={toggleRow} onPatch={patch} onRemove={remove} />
                                    </div>
                                )}
                            </section>
                        );
                    })}
                    {data && <div className="overflow-hidden rounded-xl border bg-white"><Pager info={data.pagination} noun="group" onPage={(p) => { setGPage(p); setAutoOpened(false); setOpen(new Set()); }} busy={isFetching} /></div>}
                </div>
            )}

            {itemCount > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur" data-testid="shortbook-bar">
                    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
                        <p className="text-sm"><b>{itemCount}</b> items · <b>{distributorCount}</b> distributor{distributorCount > 1 ? 's' : ''}{wholeList.length === 0 && <> · <b>{money(selectedValue)}</b></>}</p>
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                            <Button variant="ghost" onClick={clearSelection} disabled={busy}>Clear</Button>
                            <Button variant="outline" className="text-red-600" onClick={() => setRemoveOpen(true)} disabled={busy}>Remove</Button>
                            <Button className="max-sm:flex-1" onClick={createPOs} disabled={busy}>{busy ? 'Creating…' : 'Create POs'}</Button>
                        </div>
                    </div>
                </div>
            )}

            <POConfirmModal open={removeOpen} onClose={() => setRemoveOpen(false)} title={`Remove ${itemCount} item${itemCount > 1 ? 's' : ''}?`} confirmLabel="Remove" destructive
                message={<p>They leave the Shortbook. Low-stock items come back on their own if stock is still below minimum.</p>}
                onConfirm={async () => { await poApi.shortbookBulk(outletId!, { ids: itemIds, distributorIds: wholeList.map((g) => g.distributorId).filter(Boolean) as string[], action: 'remove' }); clearSelection(); invalidate(); }} />
        </div>
    );
}

const QUICK_QTY = [5, 10, 20, 50];

function InfoChip({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'warn' | 'bad' }) {
    return (
        <span className={cn('inline-flex items-baseline gap-1 rounded-md border bg-background px-2 py-1 text-xs', tone === 'warn' && 'border-amber-300 bg-amber-50', tone === 'bad' && 'border-red-300 bg-red-50')}>
            <span className="text-muted-foreground">{label}</span><b className="text-foreground">{value}</b>
        </span>
    );
}

/**
 * Note down something that is missing. Pick the medicine (the list opens by itself), see its stock, minimum and last supplier, say how many,
 * optionally who asked for it, and add. "Add & next" keeps the popup open for the next medicine, so a run of items is quick to enter.
 */
export function AddToShortbook({ open, onClose, initialProduct }: { open: boolean; onClose: () => void; initialProduct?: { id: string; name: string } | null }) {
    const outletId = useOutletId();
    const { toast } = useToast();
    const invalidate = useInvalidatePO();
    const { data: distributors } = useDistributorList();
    const [product, setProduct] = useState<{ id: string; name: string } | null>(initialProduct ?? null);
    const [qty, setQty] = useState('1');
    const [distributorId, setDistributorId] = useState('');
    const [forCustomer, setForCustomer] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState<{ name: string; qty: number }[]>([]);
    const info = useShortbookProductInfo(product?.id).data;

    const resetEntry = () => { setProduct(null); setQty('1'); setDistributorId(''); setForCustomer(false); setCustomerName(''); setCustomerPhone(''); setNote(''); setError(null); };
    useEffect(() => { if (open) { resetEntry(); setProduct(initialProduct ?? null); setAdded([]); } }, [open]);        // eslint-disable-line react-hooks/exhaustive-deps

    const qtyNum = Number(qty);
    const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1;
    const digits = customerPhone.replace(/\D/g, '');
    const phoneError = forCustomer && customerPhone.trim() !== '' && digits.length !== 10 ? 'Enter a 10-digit mobile number.' : null;
    const canAdd = !!product && qtyValid && !phoneError && (!forCustomer || customerName.trim() !== '');
    // enough to get back to the minimum once what is already on order arrives
    const suggested = info && info.minQty > 0 && info.currentStock + info.onOrder <= info.minQty ? Math.max(1, Math.ceil(info.minQty - info.currentStock - info.onOrder)) : null;
    const lastSupplierText = info?.lastDistributor ? `Last supplier (${info.lastDistributor.name})` : 'Last supplier (automatic)';
    const step = (d: number) => setQty(String(Math.max(1, (qtyValid ? qtyNum : 0) + d)));

    const save = async (another: boolean) => {
        if (!product || !canAdd || busy) return;
        setBusy(true); setError(null);
        try {
            await poApi.shortbookAdd(outletId!, { productId: product.id, qty: qtyNum, source: forCustomer ? 'customer' : 'manual', distributorId: distributorId || undefined,
                customerName: forCustomer ? customerName.trim() : '', customerPhone: forCustomer ? digits : '', note: note.trim() });
            invalidate(); toast({ title: 'Added to the Shortbook', description: `${product.name} × ${qtyNum}` });
            if (another) { setAdded((a) => [{ name: product.name, qty: qtyNum }, ...a].slice(0, 3)); resetEntry(); } else onClose();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <ModalShell open={open} onClose={onClose} title="Add to Shortbook" size="md"
            footer={<>
                <Button className="flex-1" onClick={() => save(false)} disabled={busy || !canAdd}>{busy ? 'Adding…' : 'Add'}</Button>
                <Button variant="outline" onClick={() => save(true)} disabled={busy || !canAdd}>Add &amp; next</Button>
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            </>}>
            <div className="space-y-6" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && !(e.target as HTMLElement).hasAttribute('cmdk-input')) { e.preventDefault(); save(false); } }}>
                {added.length > 0 && (
                    <p role="status" className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" /><span>Added {added.map((a) => `${a.name} × ${a.qty}`).join(' · ')}</span>
                    </p>
                )}

                <ModalSection title="Medicine">
                    {product ? (
                        <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold leading-tight">{product.name}</p>
                                    <p className="text-xs text-muted-foreground">{[info?.packLabel, info?.manufacturer].filter(Boolean).join(' · ') || ' '}</p>
                                </div>
                                <button type="button" className="shrink-0 text-xs font-semibold uppercase tracking-wide text-primary" onClick={() => { setProduct(null); setError(null); }}>Change</button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Stock details">
                                {info ? (<>
                                    <InfoChip label="In stock" value={info.currentStock} tone={info.minQty > 0 && info.currentStock <= info.minQty ? 'bad' : undefined} />
                                    <InfoChip label="Min" value={info.minQty || '—'} />
                                    <InfoChip label="On order" value={info.onOrder || '—'} />
                                    <InfoChip label="Last rate" value={info.lastRate ? money(info.lastRate) : '—'} />
                                </>) : <Skeleton className="h-6 w-64 max-w-full" />}
                            </div>
                            {info?.inShortbook && (
                                <p role="status" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                                    Already in the Shortbook: needs <b>{info.inShortbook.qty}</b> ({info.inShortbook.statusLabel}). {info.inShortbook.status === 'PENDING' ? 'What you add here is added to that.' : 'It is already on an order.'}
                                </p>
                            )}
                        </div>
                    ) : (
                        <ProductSearchDropdown defaultOpen onSelect={(p: any) => setProduct({ id: p.id, name: p.name })} context="procurement" placeholder="Search a medicine…" className="h-10 rounded-md border border-input" />
                    )}
                </ModalSection>

                <ModalSection title="Order">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="sb-qty">Quantity (packs) *</Label>
                            <div className="inline-flex w-full items-center">
                                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-r-none" aria-label="Decrease quantity" onClick={() => step(-1)}><Minus className="h-4 w-4" /></Button>
                                <Input id="sb-qty" aria-label="Quantity" inputMode="numeric" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.target.select()}
                                    className={cn('h-10 rounded-none border-x-0 text-center font-semibold', !qtyValid && 'border-red-400 bg-red-50')} />
                                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-l-none" aria-label="Increase quantity" onClick={() => step(1)}><Plus className="h-4 w-4" /></Button>
                            </div>
                            {!qtyValid ? <p role="alert" className="text-xs text-red-600">Enter a whole number, at least 1.</p> : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {QUICK_QTY.map((n) => <button key={n} type="button" onClick={() => setQty(String(n))} className={cn('rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted', qtyNum === n && 'border-primary bg-primary/10 font-semibold text-primary')}>{n}</button>)}
                                    {suggested && <button type="button" onClick={() => setQty(String(suggested))} className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10" title="Enough to reach the minimum stock once what is on order arrives">Suggested {suggested}</button>}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Distributor</Label>
                            <DistributorCombobox value={distributorId} onChange={setDistributorId} distributors={distributors} clearLabel={lastSupplierText} placeholder={lastSupplierText} />
                            <p className="text-xs text-muted-foreground">Type to search. Leave it to use the last supplier.</p>
                        </div>
                    </div>
                </ModalSection>

                <ModalSection title="Reason">
                    <div role="radiogroup" aria-label="Reason" className="grid grid-cols-2 gap-2">
                        {[{ id: false, title: 'Stock needed', text: 'Running low or out of stock' }, { id: true, title: 'Customer request', text: 'A customer asked for it' }].map((o) => (
                            <button key={String(o.id)} type="button" role="radio" aria-checked={forCustomer === o.id} onClick={() => setForCustomer(o.id)}
                                className={cn('rounded-lg border p-2.5 text-left transition-colors', forCustomer === o.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:bg-muted')}>
                                <span className="block text-sm font-semibold">{o.title}</span><span className="block text-xs text-muted-foreground">{o.text}</span>
                            </button>
                        ))}
                    </div>
                    {forCustomer && (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label htmlFor="sb-cname">Customer name *</Label><Input id="sb-cname" aria-label="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who asked for it" /></div>
                            <div className="space-y-1.5"><Label htmlFor="sb-cphone">Customer mobile</Label>
                                <Input id="sb-cphone" aria-label="Customer mobile" type="tel" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="So you can call when it arrives" className={cn(phoneError && 'border-red-400')} />
                                {phoneError && <p role="alert" className="text-xs text-red-600">{phoneError}</p>}
                            </div>
                        </div>
                    )}
                    <div className="mt-4 space-y-1.5"><Label htmlFor="sb-note">Note</Label><Input id="sb-note" aria-label="Note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. urgent or a preferred brand" /></div>
                </ModalSection>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>
        </ModalShell>
    );
}
