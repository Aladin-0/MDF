'use client';

import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import {
    ChevronDown, ChevronRight, Search, X,
    PackageOpen, FileText, History, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PurchaseSummaryCards } from './PurchaseSummaryCards';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { usePurchasesList, useDeleteDraft } from '@/hooks/usePurchases';
import { PurchaseInvoiceFull } from '@/types';
import { cn } from '@/lib/utils';
import { getPurchaseStatus, STATUS_CONFIG } from '@/lib/purchaseUtils';
import { useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Scan, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import { PaymentBreakdownCell } from '@/components/billing/PaymentBreakdownCell';

/* ─── helpers ─────────────────────────────────────────────── */

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PURCHASES_SORT_OPTIONS: SortOption[] = [
    { label: 'Latest Date', value: '-invoice_date' },
    { label: 'Oldest Date', value: 'invoice_date' },
    { label: 'Highest Amount', value: '-grand_total' },
    { label: 'Lowest Amount', value: 'grand_total' },
    { label: 'Distributor (A-Z)', value: 'distributor__name' },
];

type StatusFilter = 'all' | 'modified' | 'draft' | 'paid' | 'partial' | 'unpaid' | 'overdue';
type PeriodFilter = 'this_week' | 'this_month' | 'last_month' | 'all';

const PAGE_SIZE = 10;

function getPeriodBounds(period: PeriodFilter): { start: string; end: string } | null {
    if (period === 'all') return null;
    const today = new Date();
    let start: Date, end: Date = today;

    if (period === 'this_week') {
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
    } else if (period === 'this_month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
        // last_month
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
    };
}

/* ─── component ───────────────────────────────────────────── */

export function PurchasesList({ 
    onEditInvoice,
    onScanSuccess,
    highlightInvoiceId,
    onClearHighlight,
}: { 
    onEditInvoice?: (invoice: PurchaseInvoiceFull) => void;
    onScanSuccess?: (draftId: string) => void;
    highlightInvoiceId?: string | null;
    onClearHighlight?: () => void;
}) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchParams = useSearchParams();
    const urlModified = searchParams.get('modified') === 'true';
    const urlHighlight = searchParams.get('highlight');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(urlModified ? 'modified' : 'all');
    const [period, setPeriod] = useState<PeriodFilter>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceFull | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [activeHighlightId, setActiveHighlightId] = useState<string | null>(highlightInvoiceId || urlHighlight || null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const outlet = useAuthStore((s) => s.outlet);
    const { toast } = useToast();
    const router = useRouter();
    const currentSort = searchParams.get('sort') || '-invoice_date';

    useEffect(() => {
        if (highlightInvoiceId) {
            setActiveHighlightId(highlightInvoiceId);
        }
    }, [highlightInvoiceId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !outlet?.id) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('image', file);
        formData.append('outletId', outlet.id);

        try {
            const res = await api.post('/purchases/scan/upload/', formData, {
                params: { outletId: outlet.id },
                timeout: 120000, // 2 minutes for high-res camera photos
            });
            toast({ title: 'Upload Successful', description: 'Opening OCR analysis...' });
            if (res.data.draftId && onScanSuccess) {
                onScanSuccess(res.data.draftId);
            }
        } catch (err: any) {
            console.error('OCR Upload Error:', err);
            const msg =
                err.response?.data?.error?.message ||
                err.response?.data?.message ||
                (err.code === 'ECONNABORTED' ? 'Upload timed out. Please check your internet connection and try again.' : err.message);
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: msg,
            });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const queryParams = useMemo(() => {
        const bounds = getPeriodBounds(period);
        return {
            page,
            pageSize: PAGE_SIZE,
            status: statusFilter === 'all' ? undefined : (statusFilter === 'modified' ? undefined : statusFilter),
            isModified: statusFilter === 'modified' ? true : undefined,
            search: debouncedSearch.trim() || undefined,
            startDate: bounds?.start,
            endDate: bounds?.end,
            ordering: currentSort,
        };
    }, [page, statusFilter, debouncedSearch, period, currentSort]);

    const { data, isLoading } = usePurchasesList(queryParams);

    const allInvoices: PurchaseInvoiceFull[] = data?.data ?? [];
    const totalRecords = data?.pagination?.totalRecords ?? 0;
    const totalPages = data?.pagination?.totalPages ?? 1;

    const resetPage = () => setPage(1);

    useEffect(() => {
        if (!activeHighlightId || isLoading) return;
        const timer = setTimeout(() => {
            const el = document.getElementById(`purchase-row-${activeHighlightId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [activeHighlightId, isLoading, allInvoices]);

    const deleteDraft = useDeleteDraft();
    const handleDeleteDraft = async (id: string) => {
        if (!outlet?.id) return;
        if (!confirm('Are you sure you want to discard this draft?')) return;
        try {
            await deleteDraft.mutateAsync({ id, outletId: outlet.id });
            toast({ title: 'Draft discarded' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to discard draft', description: err.message });
        }
    };

    /* ── render ─────────────────────────────────────────────── */

    return (
        <div className="space-y-6">
            <PurchaseSummaryCards invoices={allInvoices} />

            {/* ── Active Highlight Alert Banner ── */}
            {activeHighlightId && (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-900 text-sm shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-amber-800">
                            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        </span>
                        <div>
                            <span className="font-semibold">
                                Purchase bill modified successfully!
                            </span>
                            {allInvoices.some((inv) => inv.id === activeHighlightId) ? (
                                <span className="ml-1 text-xs text-amber-700">
                                    Highlighted below in the list.
                                </span>
                            ) : (
                                <span className="ml-1 text-xs text-amber-700">
                                    (The bill may be on another page or filtered out by current search/dates)
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {statusFilter !== 'modified' && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-medium"
                                onClick={() => {
                                    setStatusFilter('modified');
                                    setPage(1);
                                }}
                            >
                                <History className="w-3 h-3 mr-1 text-amber-700" />
                                Filter Modified Bills
                            </Button>
                        )}
                        <button
                            onClick={() => {
                                setActiveHighlightId(null);
                                onClearHighlight?.();
                            }}
                            className="text-amber-700 hover:text-amber-950 p-1 rounded-md hover:bg-amber-100 transition-colors"
                            title="Dismiss highlight"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Controls ── */}
            <div className="flex flex-wrap gap-3 items-center justify-between">

                {/* Search & Scan Upload */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                            className="pl-9 pr-8 w-full sm:w-64 h-10 sm:h-9"
                            placeholder="Search invoice or distributor…"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                        />
                        {search && (
                            <button
                                onClick={() => { setSearch(''); resetPage(); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <SortDropdown
                        options={PURCHASES_SORT_OPTIONS}
                        defaultValue="-invoice_date"
                        onChange={resetPage}
                        className="w-full sm:w-auto"
                    />
                    
                    <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp" 
                        capture="environment"
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                    />
                    <Button 
                        variant="default" 
                        size="sm" 
                        className="h-10 sm:h-9 gap-1.5 w-full sm:w-auto bg-primary text-primary-foreground shadow-sm" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                        <span className="hidden sm:inline">Scan Bill</span>
                        <span className="inline sm:hidden font-semibold">Tap to Scan Invoice</span>
                    </Button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Status pills with Modified status filter */}
                    {(['all', 'modified', 'draft', 'paid', 'partial', 'unpaid', 'overdue'] as StatusFilter[]).map((s) => {
                        const isActive = statusFilter === s;
                        const isMod = s === 'modified';
                        return (
                            <button
                                key={s}
                                onClick={() => { setStatusFilter(s); resetPage(); }}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
                                    isActive
                                        ? (isMod
                                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                            : 'bg-foreground text-background border-foreground shadow-sm')
                                        : (isMod
                                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                                            : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/40')
                                )}
                            >
                                {isMod && <History className="w-3 h-3" />}
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        );
                    })}

                    {/* Period selector */}
                    <Select
                        value={period}
                        onValueChange={(v) => { setPeriod(v as PeriodFilter); resetPage(); }}
                    >
                        <SelectTrigger className="w-36 h-9 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="this_week">This Week</SelectItem>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        {/* sticky header */}
                        <thead className="bg-muted/50 border-b border-border sticky top-0 z-10">
                            <tr>
                                <th className="w-10" />
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Date</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Invoice No</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Distributor</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Items</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Goods Value</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Discount</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Net Amount</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Payment</th>
                                <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-3"><Skeleton className="h-4 w-4 rounded" /></td>
                                        {[120, 80, 160, 40, 80, 80, 80, 80, 60, 60].map((w, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <Skeleton className={`h-4 w-[${w}px]`} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : allInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={11}>
                                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                                <PackageOpen className="h-6 w-6" />
                                            </div>
                                            <div className="text-center">
                                                <p className="font-medium text-foreground">No purchases found</p>
                                                <p className="text-sm mt-0.5">
                                                    {search || statusFilter !== 'all'
                                                        ? 'Try adjusting your filters'
                                                        : 'Click "New Purchase" above to record one'}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                allInvoices.map((inv) => {
                                    const status = getPurchaseStatus(inv);
                                    const isExpanded = expandedId === inv.id;
                                    const cfg = STATUS_CONFIG[status];
                                    const isHighlighted = inv.id === activeHighlightId;

                                    return (
                                        <tr
                                            key={inv.id}
                                            id={`purchase-row-${inv.id}`}
                                            className={cn(
                                                'group cursor-pointer transition-all duration-300',
                                                isHighlighted
                                                    ? 'bg-amber-100/70 dark:bg-amber-950/40 ring-2 ring-amber-400 border-amber-300 shadow-sm'
                                                    : isExpanded ? 'bg-muted/30' : 'hover:bg-muted/40'
                                            )}
                                            onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                                        >
                                            <td className="pl-3 pr-0 py-3 text-muted-foreground">
                                                <ChevronDown className={cn(
                                                    'w-4 h-4 transition-transform duration-200',
                                                    !isExpanded && '-rotate-90'
                                                )} />
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                                {inv.invoiceDate ? format(new Date(inv.invoiceDate), 'dd MMM yyyy') : (inv.createdAt ? format(new Date(inv.createdAt), 'dd MMM yyyy') : '—')}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span>{inv.status === 'SAVED' ? '—' : inv.invoiceNo}</span>
                                                    {isHighlighted && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-900 border border-amber-300 shadow-xs animate-pulse">
                                                            <Sparkles className="w-2.5 h-2.5 text-amber-700" /> Just Modified
                                                        </span>
                                                    )}
                                                    {inv.isModified && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/dashboard/purchases/revisions/${inv.id}`);
                                                            }}
                                                            title={`Modified bill${inv.revisionCount ? ` (${inv.revisionCount} revisions)` : ''} - Click to view revision history`}
                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                                                        >
                                                            <History className="w-2.5 h-2.5 text-amber-600" />
                                                            Modified
                                                            {inv.revisionCount && inv.revisionCount > 1 ? (
                                                                <span className="text-[9px] text-amber-600 font-bold">v{inv.revisionCount}</span>
                                                            ) : null}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-foreground max-w-[180px] truncate">
                                                {inv.distributor?.name || (inv.status === 'SAVED' && inv.ocrData?.header?.partyName ? `OCR: ${inv.ocrData.header.partyName}` : (inv.status === 'SAVED' ? 'Pending OCR...' : '—'))}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                                {inv.status === 'SAVED' && inv.ocrData ? (inv.ocrData?.items?.length ?? 0) : (inv.items?.length ?? 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground whitespace-nowrap">
                                                {formatINR(inv.status === 'SAVED' && inv.ocrData ? (inv.ocrData?.totals?.subtotal ?? 0) : (inv.subtotal ?? 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                                −{formatINR(inv.status === 'SAVED' && inv.ocrData ? (inv.ocrData?.totals?.discount ?? 0) : (inv.discountAmount ?? 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                                                {formatINR(inv.status === 'SAVED' && inv.ocrData ? (inv.ocrData?.totals?.grandTotal ?? 0) : (inv.grandTotal ?? 0))}
                                            </td>
                                            <td className="px-4 py-3">
                                                <PaymentBreakdownCell
                                                    paymentMode={inv.paymentMode || inv.purchaseType || 'credit'}
                                                    cashPaid={inv.cashPaid}
                                                    upiPaid={inv.upiPaid}
                                                    cardPaid={inv.cardPaid}
                                                    bankPaid={inv.bankPaid}
                                                    chequePaid={inv.chequePaid}
                                                    creditGiven={inv.creditGiven ?? inv.outstanding}
                                                    payments={inv.payments}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={cn(
                                                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                                                    cfg.classes
                                                )}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                {inv.status === 'SAVED' ? (
                                                    <div className="flex justify-end gap-2">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 px-2 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50" 
                                                            onClick={() => handleDeleteDraft(inv.id)}
                                                            disabled={deleteDraft.isPending}
                                                        >
                                                            Discard
                                                        </Button>
                                                        <Button 
                                                            variant="default" 
                                                            size="sm" 
                                                            className="h-7 px-2 text-xs gap-1 bg-blue-600 hover:bg-blue-700" 
                                                            onClick={() => onEditInvoice && onEditInvoice(inv)}
                                                        >
                                                            Review Scan
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setSelectedInvoice(inv)}>
                                                        <FileText className="h-3.5 w-3.5" />
                                                        View
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Expanded row — rendered OUTSIDE the table to avoid DOM nesting issues */}
                {allInvoices.map((inv) => {
                    if (expandedId !== inv.id) return null;
                    return (
                        <div key={`${inv.id}-expand`} className="border-t border-border bg-muted/20 px-6 py-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                Line Items — {inv.items?.length ?? 0} products
                            </p>
                            <div className="rounded-lg border border-border overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 border-b border-border">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Batch</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Expiry</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rate</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">GST %</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {(inv.items ?? []).map((item) => (
                                            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-3 py-2 font-medium text-foreground">
                                                    {item.product?.name ?? '—'}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-muted-foreground">{item.batchNo}</td>
                                                <td className="px-3 py-2 text-muted-foreground">{item.expiryDate}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{item.qty}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{formatINR(item.purchaseRate)}</td>
                                                <td className="px-3 py-2 text-right text-muted-foreground">{item.gstRate}%</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                                                    {formatINR(item.totalAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        Showing {Math.min((page - 1) * PAGE_SIZE + 1, totalRecords)}–{Math.min(page * PAGE_SIZE, totalRecords)} of {totalRecords}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline" size="sm" className="h-8 w-8 p-0"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            ‹
                        </Button>

                        {/* numbered page buttons */}
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                            .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                                acc.push(p);
                                return acc;
                            }, [])
                            .map((p, idx) =>
                                p === '...'
                                    ? <span key={`ellipsis-${idx}`} className="px-1">…</span>
                                    : (
                                        <Button
                                            key={p}
                                            variant={page === p ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => setPage(p as number)}
                                        >
                                            {p}
                                        </Button>
                                    )
                            )
                        }

                        <Button
                            variant="outline" size="sm" className="h-8 w-8 p-0"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            ›
                        </Button>
                    </div>
                </div>
            )}

            <PurchaseDetailModal
                open={!!selectedInvoice}
                onOpenChange={(open) => !open && setSelectedInvoice(null)}
                invoice={selectedInvoice}
                onEdit={onEditInvoice ? (inv) => { setSelectedInvoice(null); onEditInvoice(inv); } : undefined}
            />
        </div>
    );
}
