'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import {
    ArrowLeft, Search, X, Eye, ShoppingCart, Receipt,
    CreditCard, FileText, RefreshCw, TrendingUp, TrendingDown, Minus, History, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { voucherApi, purchasesApi } from '@/lib/apiClient';
import { LedgerStatement, LedgerTransaction, PurchaseInvoiceFull, Voucher } from '@/types';
import { cn } from '@/lib/utils';
import { PurchaseDetailModal } from '@/components/purchases/PurchaseDetailModal';
import { VoucherDetailModal } from '@/components/accounts/VoucherDetailModal';
import { useOutletId } from '@/hooks/useOutletId';
import { useDebounce } from '@/hooks/useDebounce';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INR = (n: number) =>
    '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SourceType = 'PURCHASE' | 'SALE' | 'VOUCHER' | 'RETURN' | 'CREDIT_PAYMENT' | 'PURCHASE_PAYMENT' | string;

function txTypeLabel(sourceType: SourceType, voucherType?: string): string {
    switch (sourceType) {
        case 'PURCHASE':         return 'Purchase';
        case 'SALE':             return 'Sale';
        case 'RETURN':           return 'Return';
        case 'CREDIT_PAYMENT':   return 'Receipt';
        case 'PURCHASE_PAYMENT': return 'Payment';
        case 'VOUCHER':
            if (voucherType === 'receipt') return 'Receipt';
            if (voucherType === 'payment') return 'Payment';
            if (voucherType === 'contra')  return 'Contra';
            return 'Journal';
        default: return voucherType ?? 'Entry';
    }
}

function txColor(sourceType: SourceType): string {
    switch (sourceType) {
        case 'PURCHASE':         return 'bg-purple-100 text-purple-700 border-purple-200';
        case 'SALE':             return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'RETURN':           return 'bg-orange-100 text-orange-700 border-orange-200';
        case 'CREDIT_PAYMENT':
        case 'PURCHASE_PAYMENT': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'VOUCHER':          return 'bg-slate-100 text-slate-600 border-slate-200';
        default:                 return 'bg-slate-100 text-slate-600 border-slate-200';
    }
}

function txIcon(sourceType: SourceType) {
    switch (sourceType) {
        case 'PURCHASE': return <ShoppingCart className="h-3 w-3" />;
        case 'SALE':     return <TrendingUp className="h-3 w-3" />;
        case 'RETURN':   return <RefreshCw className="h-3 w-3" />;
        case 'CREDIT_PAYMENT':
        case 'PURCHASE_PAYMENT': return <CreditCard className="h-3 w-3" />;
        case 'VOUCHER':  return <FileText className="h-3 w-3" />;
        default:         return <Minus className="h-3 w-3" />;
    }
}

// ─── Voucher Detail Modal ─────────────────────────────────────────────────────
// Now using shared component from @/components/accounts/VoucherDetailModal

// ─── Main Page ────────────────────────────────────────────────────────────────

const LEDGER_SORT_OPTIONS: SortOption[] = [
    { label: 'Latest First', value: 'desc' },
    { label: 'Oldest First', value: 'asc' },
];

/** Entries per page. The server sorts the whole statement first and then cuts the page, so every entry is reachable. */
const PAGE_SIZE = 200;

export default function LedgerStatementPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentSort = searchParams.get('sort') || 'desc';
    const outletId = useOutletId();
    const { toast } = useToast();

    const [statement, setStatement] = useState<LedgerStatement | null>(null);
    const [loading, setLoading] = useState(true);        // first load only
    const [fetching, setFetching] = useState(false);      // any later load (page, sort, search, dates): the old table stays on screen, dimmed
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);

    // Date filter — default: 1st of current FY to today
    const [from, setFrom] = useState(() => {
        const now = new Date();
        const fyStart = now.getMonth() >= 3
            ? `${now.getFullYear()}-04-01`
            : `${now.getFullYear() - 1}-04-01`;
        return fyStart;
    });
    const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
    // the dates the statement was actually loaded with (the inputs above only apply when you press Apply Filter)
    const [applied, setApplied] = useState({ from, to });

    // The page belongs to the filters it was chosen under: change the sort, search, dates or ledger and you are back on page 1,
    // without a second fetch for a stale page number.
    const filterKey = `${id}|${currentSort}|${applied.from}|${applied.to}|${debouncedSearch}`;
    const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
    const page = pageState.key === filterKey ? pageState.page : 1;
    const goToPage = (p: number) => setPageState({ key: filterKey, page: p });

    // Preview state
    const [previewPurchaseId, setPreviewPurchaseId] = useState<string | null>(null);
    const [previewPurchaseInvoice, setPreviewPurchaseInvoice] = useState<PurchaseInvoiceFull | null>(null);
    const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
    const [purchaseLoading, setPurchaseLoading] = useState(false);

    const [voucherModalOpen, setVoucherModalOpen] = useState(false);
    const [previewVoucherId, setPreviewVoucherId] = useState('');

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setFetching(true);
        voucherApi
            .getLedgerStatement(id, applied.from, applied.to, currentSort, page, PAGE_SIZE, debouncedSearch)
            .then((r: LedgerStatement) => { if (!cancelled) setStatement(r); })
            .catch(() => { if (!cancelled) toast({ variant: 'destructive', title: 'Failed to load statement' }); })
            .finally(() => { if (!cancelled) { setLoading(false); setFetching(false); } });
        return () => { cancelled = true; };
    }, [id, currentSort, applied, debouncedSearch, page]);                                  // eslint-disable-line react-hooks/exhaustive-deps

    // Searching and paging happen on the server (so they cover every entry, not just the rows on screen): what arrives is what is shown.
    const filtered = statement?.transactions ?? [];
    const pageInfo = statement?.pagination;
    const totalEntries = statement?.totalEntries ?? pageInfo?.total_count ?? filtered.length;
    const matching = pageInfo?.total_count ?? filtered.length;
    const firstShown = filtered.length ? ((pageInfo?.page ?? 1) - 1) * (pageInfo?.page_size ?? PAGE_SIZE) + 1 : 0;
    const lastShown = firstShown ? firstShown + filtered.length - 1 : 0;

    // ── Row click handler ─────────────────────────────────────────────────────
    async function handleRowClick(tx: LedgerTransaction) {
        if (!tx.sourceId && !tx.journalEntryId) return;

        if (tx.sourceType === 'PURCHASE') {
            setPurchaseLoading(true);
            setPurchaseModalOpen(true);
            try {
                const inv = await purchasesApi.getById(tx.sourceId, outletId ?? undefined);
                setPreviewPurchaseInvoice(inv);
            } catch {
                // If inventory purchase invoice is not found (e.g. Daybook / Journal imported voucher),
                // fall back to opening the Voucher / Journal detail modal!
                setPurchaseModalOpen(false);
                const targetVoucherId = tx.journalEntryId || tx.sourceId;
                if (targetVoucherId) {
                    setPreviewVoucherId(targetVoucherId);
                    setVoucherModalOpen(true);
                } else {
                    toast({ variant: 'destructive', title: 'Could not load purchase invoice' });
                }
            } finally {
                setPurchaseLoading(false);
            }
            return;
        }

        if (tx.sourceType === 'VOUCHER') {
            setPreviewVoucherId(tx.sourceId || tx.journalEntryId || '');
            setVoucherModalOpen(true);
            return;
        }

        if (tx.sourceType === 'SALE') {
            if (tx.journalEntryId && (!tx.sourceId || tx.sourceId === tx.journalEntryId)) {
                setPreviewVoucherId(tx.journalEntryId);
                setVoucherModalOpen(true);
                return;
            }
            router.push(`/billing/${tx.sourceId}`);
            return;
        }

        // For RETURN etc — open voucher modal if journalEntryId/sourceId exists
        if (tx.journalEntryId || tx.sourceId) {
            setPreviewVoucherId(tx.journalEntryId || tx.sourceId || '');
            setVoucherModalOpen(true);
            return;
        }

        toast({ title: `${txTypeLabel(tx.sourceType, tx.voucherType)} — ${tx.description}` });
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const totalDebit  = statement?.transactions.reduce((s, t) => s + t.debit, 0)  ?? 0;
    const totalCredit = statement?.transactions.reduce((s, t) => s + t.credit, 0) ?? 0;

    return (
        <>
        <div className="space-y-5">
            {/* ── Breadcrumb header ── */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
                    <Link href="/dashboard/accounts/ledgers">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-slate-900 break-words">
                        {statement?.ledger.name ?? 'Ledger Statement'}
                    </h1>
                    {statement && (
                        <p className="text-sm text-slate-500">
                            {statement.ledger.groupName} · {statement.ledger.nature}
                        </p>
                    )}
                </div>
            </div>

            <Separator />

            {/* ── Filter bar ── */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[140px] flex-1 sm:flex-none">
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full sm:w-40 text-sm" />
                </div>
                <div className="space-y-1 min-w-[140px] flex-1 sm:flex-none">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full sm:w-40 text-sm" />
                </div>
                <Button onClick={() => setApplied({ from, to })} disabled={fetching} variant="outline" className="h-9 w-full sm:w-auto">
                    {fetching ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Apply Filter
                </Button>

                <div className="flex w-full flex-wrap items-center gap-2.5 sm:ml-auto sm:w-auto sm:flex-nowrap">
                    <SortDropdown
                        options={LEDGER_SORT_OPTIONS}
                        defaultValue="desc"
                        paramKey="sort"
                        className="w-36 h-9"
                    />

                    {/* Search */}
                    <div className="relative w-full min-w-0 sm:w-64">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                            className="h-9 pl-9 pr-8 text-sm"
                            placeholder="Search entries…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                    Loading statement…
                </div>
            ) : !statement ? null : (
                <>
                    {/* ── Summary Cards ── */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border bg-white p-4 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Opening Balance</p>
                            <div className="mt-1 flex items-baseline gap-2">
                                <p className="text-xl font-bold text-slate-800">
                                    {INR(statement.openingBalance)}
                                </p>
                                <span className="text-sm font-semibold text-slate-500">
                                    {statement.balanceType || statement.ledger.balanceType || 'Cr'}
                                </span>
                            </div>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Transactions</p>
                            <div className="mt-1 flex items-baseline gap-3">
                                <p className="text-xl font-bold text-slate-800">
                                    {totalEntries}
                                </p>
                                {debouncedSearch && matching !== totalEntries && (
                                    <span className="text-sm text-slate-400">({matching} match)</span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 font-medium">
                                Dr: {INR(statement.totalDebit ?? totalDebit)} &nbsp;·&nbsp; Cr: {INR(statement.totalCredit ?? totalCredit)}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Closing Balance</p>
                            <div className="mt-1 flex items-baseline gap-2">
                                <p className={cn(
                                    'text-xl font-bold',
                                    statement.closingBalance < 0 ? 'text-red-600' : 'text-slate-800'
                                )}>
                                    {INR(statement.closingBalance)}
                                </p>
                                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    {statement.balanceType || (statement.closingBalance >= 0
                                        ? statement.ledger.balanceType
                                        : (statement.ledger.balanceType === 'Dr' ? 'Cr' : 'Dr'))}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Transactions Table ── */}
                    {filtered.length === 0 ? (
                        <div className="rounded-xl border bg-white py-16 text-center">
                            <Search className="mx-auto mb-3 h-8 w-8 text-slate-200" />
                            <p className="text-sm text-slate-400">
                                {debouncedSearch ? `No entries match "${debouncedSearch}"` : 'No transactions in this period'}
                            </p>
                        </div>
                    ) : (
                        <div className={cn('overflow-hidden rounded-xl border bg-white shadow-sm transition-opacity', fetching && 'opacity-60')}>
                            <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead>
                                    <tr className="border-b bg-slate-50">
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Voucher</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Debit</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Credit</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Balance</th>
                                        <th className="w-10 px-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {/* Opening row */}
                                    <tr className="bg-slate-50/60">
                                        <td className="px-4 py-2.5 text-xs text-slate-400">—</td>
                                        <td className="px-4 py-2.5">
                                            <span className="inline-flex items-center gap-1 rounded border bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                                                Opening
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-slate-400" />
                                        <td className="px-4 py-2.5 text-xs text-slate-400" />
                                        <td className="px-4 py-2.5 text-right" />
                                        <td className="px-4 py-2.5 text-right" />
                                        <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-slate-700">
                                            {INR(statement.openingBalance)}
                                        </td>
                                        <td />
                                    </tr>

                                    {filtered.map((tx, i) => {
                                        const clickable = !!tx.sourceId || !!tx.journalEntryId;
                                        return (
                                            <tr
                                                key={i}
                                                onClick={() => clickable && handleRowClick(tx)}
                                                className={cn(
                                                    'group transition-colors',
                                                    clickable
                                                        ? 'cursor-pointer hover:bg-indigo-50/50'
                                                        : 'hover:bg-slate-50/60'
                                                )}
                                            >
                                                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                                                    {format(new Date(tx.date), 'dd MMM yy')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn(
                                                        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                                                        txColor(tx.sourceType)
                                                    )}>
                                                        {txIcon(tx.sourceType)}
                                                        {txTypeLabel(tx.sourceType, tx.voucherType)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                    {tx.voucherNo || '—'}
                                                </td>
                                                <td className="max-w-xs px-4 py-3 text-sm text-slate-700">
                                                    <span className="line-clamp-2">{tx.description || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm">
                                                    {tx.debit > 0
                                                        ? <span className="font-medium text-red-600">{INR(tx.debit)}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm">
                                                    {tx.credit > 0
                                                        ? <span className="font-medium text-emerald-600">{INR(tx.credit)}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-800">
                                                    {INR(tx.balance)}
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    {clickable && (
                                                        <div className="flex items-center justify-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleRowClick(tx); }}
                                                                className="inline-flex items-center justify-center rounded-full p-2.5 md:p-1.5 text-indigo-400 hover:bg-indigo-100 transition-colors"
                                                                title="View Details"
                                                            >
                                                                <Eye className="h-3.5 w-3.5" />
                                                            </button>
                                                            {tx.sourceType === 'VOUCHER' && (
                                                                <button
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        router.push(`/dashboard/accounts/vouchers?party=${statement.ledger.id}&search=${tx.voucherNo}`); 
                                                                    }}
                                                                    className="inline-flex items-center justify-center rounded-full p-2.5 md:p-1.5 text-emerald-500 hover:bg-emerald-100 transition-colors"
                                                                    title="View in Register"
                                                                >
                                                                    <List className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>

                                {/* Footer totals */}
                                <tfoot className="border-t bg-slate-50 font-semibold">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-3 text-xs uppercase tracking-wide text-slate-600">
                                            {debouncedSearch ? `Matching Totals (${matching} entries)` : `Overall Totals (${totalEntries} entries)`}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-red-600">
                                            {INR(debouncedSearch ? (statement.filteredDebit ?? 0) : (statement.totalDebit ?? 0))}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-emerald-600">
                                            {INR(debouncedSearch ? (statement.filteredCredit ?? 0) : (statement.totalCredit ?? 0))}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
                                            {INR(statement.closingBalance)} <span className="text-xs text-blue-600 font-bold">{statement.balanceType || statement.ledger.balanceType}</span>
                                        </td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                            </div>
                            {pageInfo && pageInfo.total_pages > 1 && (
                                <nav aria-label="Statement pages" className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm text-slate-600">
                                    <span>Showing {firstShown}–{lastShown} of {matching} entries</span>
                                    <span className="flex flex-wrap items-center gap-2">
                                        <Button variant="outline" size="sm" disabled={pageInfo.page <= 1 || fetching} onClick={() => goToPage(1)}>First</Button>
                                        <Button variant="outline" size="sm" disabled={pageInfo.page <= 1 || fetching} onClick={() => goToPage(pageInfo.page - 1)}>Previous</Button>
                                        <span>Page {pageInfo.page} of {pageInfo.total_pages}</span>
                                        <Button variant="outline" size="sm" disabled={!pageInfo.has_more || fetching} onClick={() => goToPage(pageInfo.page + 1)}>Next</Button>
                                        <Button variant="outline" size="sm" disabled={!pageInfo.has_more || fetching} onClick={() => goToPage(pageInfo.total_pages)}>Last</Button>
                                    </span>
                                </nav>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>

        {/* ── Purchase Invoice Preview Modal ── */}
        {purchaseLoading && purchaseModalOpen && (
            <Dialog open onOpenChange={() => setPurchaseModalOpen(false)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Loading…</DialogTitle></DialogHeader>
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
                    </div>
                </DialogContent>
            </Dialog>
        )}
        {!purchaseLoading && (
            <PurchaseDetailModal
                open={purchaseModalOpen}
                onOpenChange={setPurchaseModalOpen}
                invoice={previewPurchaseInvoice}
            />
        )}

        {/* ── Voucher Preview Modal ── */}
        <VoucherDetailModal
            open={voucherModalOpen}
            onOpenChange={setVoucherModalOpen}
            voucherId={previewVoucherId}
        />
        </>
    );
}
