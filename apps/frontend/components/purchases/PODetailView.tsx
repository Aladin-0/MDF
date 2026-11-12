'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    AlertCircle, ArrowLeft, Ban, CalendarDays, Check, ClipboardCheck, Copy, FileText, Minus, MoreHorizontal, PackageCheck, Plus, Send,
    Table as TableIcon, Trash2, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DistributorCombobox } from '@/components/shared/DistributorCombobox';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { usePermissions } from '@/hooks/usePermissions';
import { useDistributorList } from '@/hooks/usePurchases';
import { useInvalidatePO, useShortbookGroupItems } from '@/hooks/usePO';
import { getHeaders } from '@/lib/apiClient';
import { poApi, PoApiError, money, type PODetail, type POEvent } from '@/lib/poApi';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ProductSearchDropdown } from '@/components/inventory/ProductSearchDropdown';
import { POStatusBadge } from './po/POStatusBadge';
import { POConfirmModal } from './po/POConfirmModal';
import { SendPOModal } from './po/SendPOModal';
import { ModalShell } from '@/components/shared/ModalShell';

interface DraftLine {
    productId: string; productName: string; packLabel: string; currentStock: number; minQty: number; onOrder: number;
    lastRate: string | null; qty: string; rate: string; shortbookItemId: string | null;
}

const fromServer = (po: PODetail): DraftLine[] => po.items.map((i) => ({
    productId: i.productId, productName: i.productName, packLabel: i.packLabel, currentStock: i.currentStock, minQty: i.minQty, onOrder: i.onOrder,
    lastRate: i.lastPurchaseRate, qty: String(i.qty), rate: i.estRate, shortbookItemId: i.shortbookItemId,
}));

const lineTotal = (l: DraftLine) => (Number(l.qty) || 0) * (Number(l.rate) || 0);
const snapshot = (lines: DraftLine[], notes: string, expected: string, dist: string) =>
    JSON.stringify([lines.map((l) => [l.productId, l.qty, l.rate]), notes, expected, dist]);

const EVENT_TEXT: Record<string, (e: POEvent) => string> = {
    created: (e) => (e.payload.duplicated_from ? `Created as a copy of ${e.payload.duplicated_from}` : 'Created as a draft'),
    edited: () => 'Draft edited',
    sent: (e) => `Sent (${({ whatsapp_link: 'WhatsApp link', pdf_whatsapp: 'PDF via WhatsApp', email: 'email', manual: 'ordered by phone' } as any)[e.payload.channel] ?? e.payload.channel})`,
    resent: () => 'Sent again',
    received: (e) => `Received against invoice ${e.payload.invoice || '—'}: ${e.payload.received} of ${e.payload.ordered} packs`,
    closed_short: (e) => `Closed short${e.payload.returned_to_shortbook ? ` · ${e.payload.returned_to_shortbook} packs back in the Shortbook` : ''}`,
    cancelled: (e) => `Cancelled: ${e.payload.reason}`,
    expired: () => 'Expired with nothing received · items returned to the Shortbook',
    duplicated: (e) => `Copied to ${e.payload.copy}`,
};

export function PODetailView({ orderId }: { orderId: string }) {
    const outletId = useOutletId();
    const router = useRouter();
    const search = useSearchParams();
    const { toast } = useToast();
    const { hasPermission } = usePermissions();
    const invalidate = useInvalidatePO();
    const isNew = orderId === 'new';

    const { data: distributors } = useDistributorList();
    const { data: serverPo, isLoading, error: loadError } = useQuery<PODetail>({
        queryKey: ['purchaseOrder', outletId, orderId],
        queryFn: () => poApi.get(outletId!, orderId),
        enabled: !!outletId && !isNew,
    });

    const [lines, setLines] = useState<DraftLine[]>([]);
    const [notes, setNotes] = useState('');
    const [expected, setExpected] = useState('');
    const [distId, setDistId] = useState(search.get('distributorId') || '');
    const [base, setBase] = useState(snapshot([], '', '', search.get('distributorId') || ''));
    const [seededFor, setSeededFor] = useState<string | null>(isNew ? 'new' : null);
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [problem, setProblem] = useState<{ message: string; stale?: boolean } | null>(null);
    const [sendOpen, setSendOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [shortOpen, setShortOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [pickOpen, setPickOpen] = useState(false);

    const canCreate = hasPermission('create_purchases');
    const status = isNew ? 'SAVED' : serverPo?.status;
    const allowed = new Set(isNew ? (canCreate ? ['edit', 'send'] : []) : serverPo?.allowedActions ?? []);
    const editable = allowed.has('edit');

    // Seed the editor from the server (again after every save, with the new version)
    const seed = useCallback((po: PODetail) => {
        const l = fromServer(po);
        setLines(l); setNotes(po.notes || ''); setExpected(po.expectedDate || ''); setDistId(po.distributorId);
        setBase(snapshot(l, po.notes || '', po.expectedDate || '', po.distributorId));
        setSeededFor(`${po.id}:${po.version}`);
    }, []);
    useEffect(() => { if (serverPo && seededFor !== `${serverPo.id}:${serverPo.version}`) seed(serverPo); }, [serverPo, seededFor, seed]);
    useEffect(() => { if (search.get('send') === '1' && serverPo && allowed.has('send')) setSendOpen(true); }, [serverPo?.id]);     // eslint-disable-line react-hooks/exhaustive-deps

    const dirty = editable && snapshot(lines, notes, expected, distId) !== base;
    const distName = isNew ? distributors?.find((d: any) => d.id === distId)?.name : serverPo?.distributorName;

    // ── Unsaved-changes guard: closing the tab, and clicking any in-app link ──
    const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
    useEffect(() => {
        const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
        const onClick = (e: MouseEvent) => {
            const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!dirtyRef.current || !a || a.target === '_blank' || a.href.startsWith('javascript') || !a.href.startsWith(window.location.origin)) return;
            if (!window.confirm('You have unsaved changes on this order. Leave without saving?')) { e.preventDefault(); e.stopPropagation(); }
        };
        window.addEventListener('beforeunload', onUnload);
        document.addEventListener('click', onClick, true);
        return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true); };
    }, []);

    // ── Validation: every problem is shown, nothing is dropped silently ──
    const lineProblem = (l: DraftLine) => (!(Number(l.qty) >= 1) || !Number.isInteger(Number(l.qty)) ? 'Quantity must be at least 1' : (Number(l.rate) < 0 ? 'Rate cannot be negative' : ''));
    const problems = useMemo(() => {
        const out: string[] = [];
        if (!distId) out.push('Pick a distributor before saving.');
        if (lines.length === 0) out.push('Add at least one item before saving.');
        else if (lines.some((l) => lineProblem(l))) out.push('Fix the highlighted quantities (each must be at least 1) or remove the line.');
        return out;
    }, [lines, distId]);                                      // eslint-disable-line react-hooks/exhaustive-deps

    const totals = useMemo(() => ({ items: lines.length, qty: lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), amount: lines.reduce((s, l) => s + lineTotal(l), 0) }), [lines]);

    const body = () => ({
        items: lines.map((l) => ({ productId: l.productId, orderQty: Number(l.qty), estRate: l.rate || '0', shortbookItemId: l.shortbookItemId })),
        notes, expectedDate: expected || null,
    });

    /** Save the draft. Returns the saved PO id, or null when something stopped it (the reason is on screen). */
    const save = async (quiet = false): Promise<string | null> => {
        setShowErrors(true); setProblem(null);
        if (problems.length) { setProblem({ message: problems[0] }); return null; }
        setSaving(true);
        try {
            if (isNew) {
                const po = await poApi.create(outletId!, { distributorId: distId, ...body() });
                invalidate();
                if (!quiet) toast({ title: 'Draft saved', description: `${po.poNumber} created.` });
                setBase(snapshot(lines, notes, expected, distId));
                dirtyRef.current = false;
                router.replace(`/dashboard/purchases/orders/${po.id}`);
                return po.id;
            }
            const po = await poApi.save(outletId!, serverPo!.id, { version: serverPo!.version, distributorId: distId, ...body() });
            invalidate();
            seed(po);
            if (!quiet) toast({ title: 'Draft saved' });
            return po.id;
        } catch (e) {
            const err = e as PoApiError;
            setProblem({ message: err.message, stale: err.code === 'STALE' || err.code === 'LOCKED' });
            return null;
        } finally { setSaving(false); }
    };

    const download = async (kind: 'pdf' | 'excel') => {
        let id = serverPo?.id ?? null;
        if (isNew || dirty) id = await save(true);
        if (!id) return;
        try {
            const res = await fetch(poApi.exportUrl(outletId!, id, kind), { headers: getHeaders() });
            if (!res.ok) throw new Error();
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement('a');
            a.href = url; a.download = `PurchaseOrder_${serverPo?.poNumber || id}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch { toast({ variant: 'destructive', title: 'Export failed', description: `Could not download the ${kind === 'pdf' ? 'PDF' : 'Excel'} file.` }); }
    };

    const startSend = async () => {
        if (isNew) { const id = await save(true); if (id) router.replace(`/dashboard/purchases/orders/${id}?send=1`); return; }
        if (dirty && !(await save(true))) return;
        setSendOpen(true);
    };

    // ── Adding lines ──
    const addProduct = (p: any) => {
        if (lines.some((l) => l.productId === p.id)) { toast({ title: 'Already on this order', description: `${p.name} is already in the list.` }); return; }
        setLines((prev) => [...prev, {
            productId: p.id, productName: p.name, packLabel: p.packSize ? `${p.packSize} ${p.packType || 'strip'}` : '', currentStock: Number(p.currentStock ?? p.totalStock ?? 0),
            minQty: Number(p.minQty ?? 0), onOrder: 0, lastRate: null, qty: '1', rate: String(p.purchaseRate || (p.mrp ? (p.mrp * 0.8).toFixed(2) : '0')), shortbookItemId: null,
        }]);
    };
    const pullLowStock = async () => {
        try {
            const res = await poApi.suggestions(outletId!, distId || undefined);
            const have = new Set(lines.map((l) => l.productId));
            const fresh = res.data.filter((a: any) => !have.has(a.productId));
            setLines((prev) => [...prev, ...fresh.map((a: any): DraftLine => ({
                productId: a.productId, productName: a.productName, packLabel: a.packSize ? `${a.packSize} ${a.packType}` : '', currentStock: Number(a.currentStock ?? 0),
                minQty: Number(a.minQty ?? 0), onOrder: Number(a.onOrder ?? 0), lastRate: a.lastPurchasePrice ? String(a.lastPurchasePrice) : null,
                qty: String(Math.max(1, Math.ceil(a.deficit || 1))), rate: Number(a.estimatedPtr || 0).toFixed(2), shortbookItemId: null,
            }))]);
            toast({ title: fresh.length ? `Added ${fresh.length} low-stock item${fresh.length > 1 ? 's' : ''}` : 'Nothing new to add', description: res.data.length >= 200 ? 'Showing the first 200 low-stock items.' : undefined });
        } catch (e: any) { toast({ variant: 'destructive', title: 'Could not pull low stock', description: e.message }); }
    };
    const setLine = (i: number, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
    const step = (i: number, d: number) => setLine(i, { qty: String(Math.max(0, (Number(lines[i].qty) || 0) + d)) });

    // ── Rendering ──
    if (!isNew && isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-[400px] w-full" /></div>;
    if (!isNew && (loadError || !serverPo)) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
                <AlertCircle className="h-10 w-10 text-slate-300" />
                <p className="font-medium">{(loadError as Error)?.message || 'Purchase order not found.'}</p>
                <Button variant="outline" asChild><Link href="/dashboard/purchases?tab=purchase_orders">Back to purchase orders</Link></Button>
            </div>
        );
    }

    const po = serverPo;
    const lockedText = po && !editable && po.status !== 'SAVED';
    const progress = po && po.orderedQty ? Math.min(100, Math.round((po.receivedQty / po.orderedQty) * 100)) : 0;

    return (
        <div className="space-y-5 pb-32 sm:pb-24">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Button variant="ghost" size="icon" asChild aria-label="Back to purchase orders"><Link href="/dashboard/purchases?tab=purchase_orders"><ArrowLeft className="w-5 h-5" /></Link></Button>
                <div className="min-w-0">
                    <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight max-sm:break-words">
                        {isNew ? 'New PO' : po!.poNumber}
                        <POStatusBadge status={status as any} />
                        {po?.closedShort && <span className="text-xs font-medium text-slate-500">closed short</span>}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground max-sm:break-words">
                        {distName ? <>Distributor: <span className="font-medium text-foreground">{distName}</span></> : 'No distributor yet'}
                        {po && <> · Ordered {format(new Date(po.orderDate), 'dd MMM yyyy')}</>}
                        {po?.overdue && <span className="ml-2 font-semibold text-red-600">Overdue</span>}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                    {editable && <Button variant="outline" onClick={() => save()} disabled={saving}>{saving ? 'Saving...' : 'Save draft'}</Button>}
                    {allowed.has('send') && <Button onClick={startSend} disabled={saving}><Send className="w-4 h-4 mr-2" />Send</Button>}
                    {allowed.has('resend') && <Button variant="outline" onClick={() => setSendOpen(true)}><Send className="w-4 h-4 mr-2" />Resend</Button>}
                    {allowed.has('receive') && <Button onClick={() => router.push(`/dashboard/purchases?tab=new&poId=${po!.id}`)}><PackageCheck className="w-4 h-4 mr-2" />Receive goods</Button>}
                    {allowed.has('close_short') && <Button variant="outline" onClick={() => setShortOpen(true)}><ClipboardCheck className="w-4 h-4 mr-2" />Close short</Button>}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More actions" className="max-sm:h-10 max-sm:w-10"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => download('pdf')}><FileText className="w-4 h-4 mr-2" />Export PDF</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => download('excel')}><TableIcon className="w-4 h-4 mr-2" />Export Excel</DropdownMenuItem>
                            {po?.shareToken && <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/po/${po.shareToken}`); toast({ title: 'Link copied' }); }}><Copy className="w-4 h-4 mr-2" />Copy link</DropdownMenuItem>}
                            {allowed.has('duplicate') && <DropdownMenuItem onClick={async () => { try { const c = await poApi.duplicate(outletId!, po!.id); invalidate(); toast({ title: 'Copied', description: `${c.poNumber} created as a draft.` }); router.push(`/dashboard/purchases/orders/${c.id}`); } catch (e: any) { toast({ variant: 'destructive', title: 'Could not duplicate', description: e.message }); } }}><Copy className="w-4 h-4 mr-2" />Duplicate</DropdownMenuItem>}
                            {(allowed.has('cancel') || allowed.has('delete')) && <DropdownMenuSeparator />}
                            {allowed.has('cancel') && <DropdownMenuItem className="text-red-600" onClick={() => setCancelOpen(true)}><Ban className="w-4 h-4 mr-2" />Cancel order</DropdownMenuItem>}
                            {allowed.has('delete') && <DropdownMenuItem className="text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-2" />Delete draft</DropdownMenuItem>}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {lockedText && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    This order is <b>{po!.statusLabel}</b>, so its lines are locked.{po!.status === 'CANCELLED' && po!.cancelReason ? <> Cancelled: {po!.cancelReason}.</> : null}{' '}
                    {allowed.has('duplicate') && 'Use Duplicate to start a new draft with the same lines.'}
                </div>
            )}
            {problem && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" /> <span className="flex-1">{problem.message}</span>
                    {problem.stale && <Button size="sm" variant="outline" onClick={() => { setProblem(null); setSeededFor(null); invalidate(); }}>Reload</Button>}
                </div>
            )}

            {/* Draft details */}
            {editable && (
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Distributor *</label>
                        <DistributorCombobox value={distId} onChange={setDistId} distributors={distributors} invalid={showErrors && !distId} placeholder="Search or select a distributor" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Expected delivery</label>
                        <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Expected delivery" type="date" className="pl-9" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Notes</label>
                        <Input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the distributor should know" />
                    </div>
                </div>
            )}

            {/* Toolbar */}
            {editable && (
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="w-full md:w-[420px]"><ProductSearchDropdown onSelect={addProduct} context="procurement" placeholder="Search a product to add…" className="rounded-md border border-input shadow-sm" /></div>
                    <Button variant="outline" onClick={pullLowStock}><Zap className="w-4 h-4 mr-2" />Pull low stock</Button>
                    <Button variant="outline" onClick={() => setPickOpen(true)}><Plus className="w-4 h-4 mr-2" />Add from Shortbook</Button>
                    <span className="text-xs text-muted-foreground md:ml-auto">Low stock pull shows up to 200 items for this distributor.</span>
                </div>
            )}

            {/* Read-only progress */}
            {po && !editable && po.status !== 'SAVED' && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white px-4 py-3">
                    <div className="text-sm"><span className="font-semibold">{po.receivedQty}</span> of <span className="font-semibold">{po.orderedQty}</span> packs received</div>
                    <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>
                    {po.expectedDate && <div className={cn('text-sm', po.overdue ? 'font-semibold text-red-600' : 'text-muted-foreground')}>Expected {format(new Date(po.expectedDate), 'dd MMM yyyy')}</div>}
                </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
                <div className="min-w-0">
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm lg:block">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="w-12 text-center">#</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-center">Pack</TableHead>
                                    <TableHead className="text-center">Stock</TableHead>
                                    <TableHead className="text-center">Min</TableHead>
                                    <TableHead className="text-center">On order</TableHead>
                                    <TableHead className="text-right">Last rate</TableHead>
                                    <TableHead className="text-center">{editable ? 'Qty' : 'Ordered'}</TableHead>
                                    {!editable && <><TableHead className="text-center">Received</TableHead><TableHead className="text-center">Remaining</TableHead></>}
                                    <TableHead className="text-right">Est. rate</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    {editable && <TableHead className="w-12" />}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(editable ? lines.length === 0 : po!.items.length === 0) ? (
                                    <TableRow><TableCell colSpan={12} className="h-28 text-center text-muted-foreground">
                                        No items yet. Search a product above, pull low stock, or add from the Shortbook.
                                    </TableCell></TableRow>
                                ) : editable ? lines.map((l, i) => {
                                    const bad = showErrors && lineProblem(l);
                                    return (
                                        <TableRow key={l.productId}>
                                            <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                                            <TableCell className="font-medium">{l.productName}</TableCell>
                                            <TableCell className="text-center text-muted-foreground">{l.packLabel || '—'}</TableCell>
                                            <TableCell className="text-center">{l.currentStock}</TableCell>
                                            <TableCell className="text-center">{l.minQty}</TableCell>
                                            <TableCell className="text-center">{l.onOrder || '—'}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{l.lastRate ? money(l.lastRate) : '—'}</TableCell>
                                            <TableCell>
                                                <QtyStepper value={l.qty} invalid={!!bad} onChange={(v) => setLine(i, { qty: v })} onStep={(d) => step(i, d)} />
                                                {bad && <p className="mt-1 text-center text-[11px] text-red-600">{lineProblem(l)}</p>}
                                            </TableCell>
                                            <TableCell className="text-right"><Input aria-label={`Rate for ${l.productName}`} type="number" step="0.01" min={0} className="ml-auto h-8 w-24 text-right" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} /></TableCell>
                                            <TableCell className="text-right font-semibold">{money(lineTotal(l))}</TableCell>
                                            <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" aria-label={`Remove ${l.productName}`} onClick={() => setLines((p) => p.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                                        </TableRow>
                                    );
                                }) : po!.items.map((it, i) => (
                                    <TableRow key={it.id}>
                                        <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                                        <TableCell className="font-medium">{it.productName}</TableCell>
                                        <TableCell className="text-center text-muted-foreground">{it.packLabel || '—'}</TableCell>
                                        <TableCell className="text-center">{it.currentStock}</TableCell>
                                        <TableCell className="text-center">{it.minQty}</TableCell>
                                        <TableCell className="text-center">{it.onOrder || '—'}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{it.lastPurchaseRate ? money(it.lastPurchaseRate) : '—'}</TableCell>
                                        <TableCell className="text-center font-medium">{it.qty}</TableCell>
                                        <TableCell className="text-center">{it.receivedQty}</TableCell>
                                        <TableCell className={cn('text-center font-semibold', it.remainingQty ? 'text-amber-700' : 'text-emerald-700')}>{it.remainingQty ? it.remainingQty : <Check className="mx-auto h-4 w-4" />}</TableCell>
                                        <TableCell className="text-right">{money(it.estRate)}</TableCell>
                                        <TableCell className="text-right font-semibold">{money(it.lineTotal)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile / tablet: stacked cards instead of sideways scrolling */}
                    <div className="space-y-3 lg:hidden" data-testid="po-cards">
                        {(editable ? lines : []).map((l, i) => {
                            const bad = showErrors && lineProblem(l);
                            return (
                                <div key={l.productId} className="rounded-xl border bg-white p-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0"><p className="font-semibold max-sm:break-words">{l.productName}</p><p className="text-xs text-muted-foreground">{l.packLabel || '—'} · stock {l.currentStock} · min {l.minQty}{l.onOrder ? ` · on order ${l.onOrder}` : ''}</p></div>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500 max-sm:h-9 max-sm:w-9" aria-label={`Remove ${l.productName}`} onClick={() => setLines((p) => p.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <QtyStepper value={l.qty} invalid={!!bad} onChange={(v) => setLine(i, { qty: v })} onStep={(d) => step(i, d)} />
                                        <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">₹</span><Input aria-label={`Rate for ${l.productName}`} type="number" step="0.01" min={0} className="h-8 w-24 text-right max-sm:h-9" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} /></div>
                                    </div>
                                    {bad && <p className="mt-1 text-xs text-red-600">{lineProblem(l)}</p>}
                                    <p className="mt-2 text-right text-sm font-semibold">{money(lineTotal(l))}</p>
                                </div>
                            );
                        })}
                        {!editable && po!.items.map((it) => (
                            <div key={it.id} className="rounded-xl border bg-white p-3 shadow-sm">
                                <p className="font-semibold max-sm:break-words">{it.productName}</p>
                                <p className="text-xs text-muted-foreground">{it.packLabel || '—'}</p>
                                <div className="mt-2 grid grid-cols-3 text-center text-sm"><div><p className="text-xs text-muted-foreground">Ordered</p><b>{it.qty}</b></div><div><p className="text-xs text-muted-foreground">Received</p><b>{it.receivedQty}</b></div><div><p className="text-xs text-muted-foreground">Remaining</p><b className={it.remainingQty ? 'text-amber-700' : 'text-emerald-700'}>{it.remainingQty}</b></div></div>
                                <p className="mt-2 text-right text-sm font-semibold">{money(it.lineTotal)}</p>
                            </div>
                        ))}
                        {editable && lines.length === 0 && <p className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">No items yet. Search a product above, pull low stock, or add from the Shortbook.</p>}
                    </div>
                </div>

                {/* Activity timeline (saved orders) */}
                {po && (
                    <aside className="rounded-xl border bg-white p-4 shadow-sm lg:self-start" aria-label="Activity">
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Activity</h2>
                        <ol className="space-y-3">
                            {[...po.events].reverse().map((e) => (
                                <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                                    <p className="text-sm">{(EVENT_TEXT[e.action] ?? (() => e.action))(e)}</p>
                                    <p className="text-xs text-muted-foreground">{e.userName ? `${e.userName} · ` : ''}{format(new Date(e.at), 'dd MMM, hh:mm a')}</p>
                                </li>
                            ))}
                            {po.events.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
                        </ol>
                    </aside>
                )}
            </div>

            {/* Sticky footer */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:left-auto md:right-0 md:w-full" data-testid="po-footer">
                <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                        <b className="text-foreground">{editable ? totals.items : po!.itemCount}</b> items · <b className="text-foreground">{editable ? totals.qty : po!.orderedQty}</b> packs
                        {dirty && <span className="ml-3 font-medium text-amber-600">Unsaved changes</span>}
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-4">
                        <div className="text-lg font-bold max-sm:mr-auto">{money(editable ? totals.amount : po!.totalAmount)}</div>
                        {editable && <Button variant="outline" onClick={() => save()} disabled={saving}>{saving ? 'Saving...' : 'Save draft'}</Button>}
                        {allowed.has('send') && <Button onClick={startSend} disabled={saving}><Send className="w-4 h-4 mr-2" />Send</Button>}
                    </div>
                </div>
            </div>

            {po && (
                <>
                    <SendPOModal open={sendOpen} onClose={() => { setSendOpen(false); if (search.get('send')) router.replace(`/dashboard/purchases/orders/${po.id}`); }} outletId={outletId!} po={po}
                        onSent={() => { invalidate(); }} onDownload={download} />
                    <POConfirmModal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${po.poNumber}?`} confirmLabel="Cancel order" destructive reasonLabel="Reason"
                        message={<p>Everything not yet received goes back to the Shortbook as pending. The distributor's link will show it as cancelled.</p>}
                        onConfirm={async (reason) => { await poApi.cancel(outletId!, po.id, reason); invalidate(); toast({ title: 'Order cancelled' }); }} />
                    <POConfirmModal open={shortOpen} onClose={() => setShortOpen(false)} title="Close short?" confirmLabel="Close short"
                        message={<p>The order will be marked <b>Completed</b> with what arrived ({po.receivedQty} of {po.orderedQty} packs). The {po.orderedQty - po.receivedQty} that did not arrive go back to the Shortbook as pending.</p>}
                        onConfirm={async () => { await poApi.closeShort(outletId!, po.id); invalidate(); toast({ title: 'Closed short' }); }} />
                    <POConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete this draft?" confirmLabel="Delete draft" destructive
                        message={<p>{po.poNumber} will be removed. Any Shortbook items on it go back to pending.</p>}
                        onConfirm={async () => { await poApi.remove(outletId!, po.id); invalidate(); toast({ title: 'Draft deleted' }); dirtyRef.current = false; router.push('/dashboard/purchases?tab=purchase_orders'); }} />
                </>
            )}
            <ShortbookPicker open={pickOpen} onClose={() => setPickOpen(false)} distributorId={distId}
                have={new Set(lines.map((l) => l.productId))}
                onPick={(rows) => { setLines((prev) => [...prev, ...rows]); setPickOpen(false); toast({ title: `Added ${rows.length} from the Shortbook` }); }} />
        </div>
    );
}

function QtyStepper({ value, invalid, onChange, onStep }: { value: string; invalid: boolean; onChange: (v: string) => void; onStep: (d: number) => void }) {
    return (
        <div className="mx-auto inline-flex items-center">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-r-none max-sm:h-9 max-sm:w-9" aria-label="Decrease quantity" onClick={() => onStep(-1)}><Minus className="h-3.5 w-3.5" /></Button>
            <Input aria-label="Quantity" inputMode="numeric" type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)}
                className={cn('h-8 w-16 rounded-none border-x-0 text-center max-sm:h-9', invalid && 'border-red-400 bg-red-50')} />
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-l-none max-sm:h-9 max-sm:w-9" aria-label="Increase quantity" onClick={() => onStep(1)}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
    );
}

/** Pending Shortbook items for this distributor, tick and add to the draft. */
function ShortbookPicker({ open, onClose, distributorId, have, onPick }: { open: boolean; onClose: () => void; distributorId: string; have: Set<string>; onPick: (rows: DraftLine[]) => void }) {
    // only this distributor's pending items, fetched when the picker opens (not the whole Shortbook filtered in the browser)
    const { data, isLoading } = useShortbookGroupItems(distributorId || 'none', { status: 'PENDING', pageSize: 100 }, open && !!distributorId);
    const [ticked, setTicked] = useState<Set<string>>(new Set());
    useEffect(() => { if (open) setTicked(new Set()); }, [open]);
    const rows = (data?.results ?? []).filter((r) => !have.has(r.productId));
    const toggle = (id: string) => setTicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    return (
        <ModalShell open={open} onClose={onClose} title="Add from Shortbook" size="md"
            footer={<><Button className="flex-1" disabled={!ticked.size} onClick={() => onPick(rows.filter((r) => ticked.has(r.id)).map((r): DraftLine => ({
                productId: r.productId, productName: r.productName, packLabel: r.packLabel, currentStock: r.currentStock, minQty: r.minQty, onOrder: r.onOrder,
                lastRate: r.lastRate, qty: String(r.qtyNeeded), rate: r.lastRate || '0', shortbookItemId: r.id,
            })))}>Add {ticked.size || ''} to order</Button><Button variant="outline" onClick={onClose}>Cancel</Button></>}>
            {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No pending Shortbook items for this distributor.</p> : (
                <ul className="divide-y rounded-md border">
                    {rows.map((r) => (
                        <li key={r.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50 max-sm:py-3">
                            <input type="checkbox" className="accent-primary" checked={ticked.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.productName} />
                            <span className="min-w-0 flex-1"><span className="block text-sm font-medium max-sm:break-words">{r.productName}</span><span className="block text-xs text-muted-foreground">{r.sourceLabel} · needs {r.qtyNeeded}</span></span>
                        </label></li>
                    ))}
                </ul>
            )}
        </ModalShell>
    );
}
