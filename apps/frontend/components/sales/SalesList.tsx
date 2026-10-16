'use client';

import { useState, useEffect } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import {
    Printer, Eye, X, ShoppingBag, Search,
    CalendarRange, PlusCircle, ChevronLeft, ChevronRight, Users,
    TrendingUp, BarChart3, Wallet, CreditCard, Smartphone, Banknote, Tag, ArrowUpRight,
    Download, RefreshCw
} from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useSalesList, useSaleById } from '@/hooks/useSales';
import { SaleInvoice } from '@/types';
import { cn } from '@/lib/utils';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import { PaymentBreakdownCell } from '@/components/billing/PaymentBreakdownCell';
import { getStoredToken } from '@/lib/apiClient';

const PAYMENT_FILTER_OPTIONS = [
    { label: 'All Payments', value: 'all' },
    { label: 'Cash', value: 'cash' },
    { label: 'UPI', value: 'upi' },
    { label: 'Card', value: 'card' },
    { label: 'Credit', value: 'credit' },
    { label: 'Split', value: 'split' },
    { label: 'Bank Transfer', value: 'bank_transfer' },
    { label: 'Cheque', value: 'cheque' },
];

// ── formatters ────────────────────────────────────────────────────────────────
const fmt = (n: number | undefined) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n: number) =>
    '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const PAYMENT_COLORS: Record<string, string> = {
    cash: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    upi: 'bg-blue-100 text-blue-700 border-blue-200',
    card: 'bg-purple-100 text-purple-700 border-purple-200',
    credit: 'bg-orange-100 text-orange-700 border-orange-200',
    split: 'bg-slate-100 text-slate-700 border-slate-200',
    ledger: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    cheque: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    bank_transfer: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

// ── date helpers ──────────────────────────────────────────────────────────────
const fd = (d: Date) => format(d, 'yyyy-MM-dd');
const now = new Date();
const PAGE_SIZE = 10;

const DATE_PRESETS = [
    { label: 'Today', start: fd(now), end: fd(now) },
    { label: 'Yesterday', start: fd(subDays(now, 1)), end: fd(subDays(now, 1)) },
    { label: 'This Week', start: fd(startOfWeek(now, { weekStartsOn: 1 })), end: fd(endOfWeek(now, { weekStartsOn: 1 })) },
    { label: 'This Month', start: fd(startOfMonth(now)), end: fd(endOfMonth(now)) },
    { label: 'Last 7 Days', start: fd(subDays(now, 6)), end: fd(now) },
    { label: 'Last 30 Days', start: fd(subDays(now, 29)), end: fd(now) },
];

const SALES_SORT_OPTIONS: SortOption[] = [
    { label: 'Latest Date', value: '-invoice_date' },
    { label: 'Oldest Date', value: 'invoice_date' },
    { label: 'Highest Amount', value: '-grand_total' },
    { label: 'Lowest Amount', value: 'grand_total' },
    { label: 'Customer (A-Z)', value: 'customer__name' },
];

function SaleInvoiceModal({ invoiceId, onClose, onEdit, onViewHistory }: { invoiceId: string; onClose: () => void; onEdit?: (invoice: SaleInvoice) => void; onViewHistory?: () => void }) {
    const { data: invoice } = useSaleById(invoiceId);

    return (
        <InvoicePreviewModal
            isOpen={true}
            onClose={onClose}
            invoice={invoice as any}
            onEdit={onEdit}
            onViewHistory={onViewHistory ? () => onViewHistory() : undefined}
        />
    );
}


// ── Main Sales Page ───────────────────────────────────────────────────────────
export default function SalesList() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentSort = searchParams.get('sort') || '-invoice_date';
    const currentPaymentMode = searchParams.get('paymentMode') || 'all';

    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [startDate, setStartDate] = useState(fd(now));
    const [endDate, setEndDate] = useState(fd(now));
    const [activePreset, setActivePreset] = useState('Today');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [saleType, setSaleType] = useState<'ALL' | 'RETAIL' | 'WHOLESALE'>('ALL');
    const [page, setPage] = useState(1);
    const user = useAuthStore((s) => s.user);
    const canEdit = user?.role === 'super_admin' || user?.role === 'admin' || !!user?.canEditSales || !!user?.canModifyDraftBill || !!user?.canModifyUnpaidBill || !!user?.canModifyPaidBill;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleEditSale = (invoice: SaleInvoice) => {
        setSelectedInvoiceId(null);
        router.push(`/billing?edit=${invoice.id}`);
    };

    const handlePaymentModeChange = (val: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (val === 'all') {
            params.delete('paymentMode');
        } else {
            params.set('paymentMode', val);
        }
        params.delete('page');
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        setPage(1);
    };

    // When search is active: bypass date filters → search ALL dates (newest first)
    // When search is empty: apply selected date range
    const isSearching = debouncedSearch.trim().length > 0;
    const { data, isLoading } = useSalesList({
        startDate: isSearching ? undefined : startDate,
        endDate:   isSearching ? undefined : endDate,
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        saleType: saleType === 'ALL' ? undefined : saleType,
        paymentMode: currentPaymentMode !== 'all' ? currentPaymentMode : undefined,
        ordering: currentSort,
    });
    const invoices: SaleInvoice[] = data?.data ?? [];
    const pagination = data?.pagination;
    // No further client-side filter needed; backend handles search
    const filteredInvoices = invoices;

    // ── Analytics from backend (already filtered by date) ───────────────────
    // Backend returns analytics object with pre-aggregated numbers for selected date range.
    // client-side search only filters table rows, not the analytics numbers.
    const analytics = (data as any)?.analytics;
    const totalBills      = analytics?.totalBills      ?? pagination?.totalRecords ?? 0;
    const totalRevenue    = analytics?.totalSales      ?? analytics?.totalRevenue ?? 0;
    const avgBillValue    = analytics?.avgBillValue    ?? (totalBills > 0 ? totalRevenue / totalBills : 0);
    const totalCost       = analytics?.totalCost       ?? 0;
    const totalProfit     = analytics?.totalProfit     ?? 0;
    const totalDiscount   = analytics?.totalDiscount   ?? 0;
    const cashTotal       = analytics?.cashCollected   ?? 0;
    const upiTotal        = analytics?.upiCollected    ?? 0;
    const cardTotal       = analytics?.cardCollected   ?? 0;
    const creditTotal     = analytics?.creditGiven     ?? 0;
    const totalGst        = invoices.reduce((s, i) => s + ((i.cgstAmount ?? 0) + (i.sgstAmount ?? 0)), 0);
    const collectedTotal  = cashTotal + upiTotal + cardTotal;
    const profitMarginPct = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    const applyPreset = (start: string, end: string, label: string) => {
        setStartDate(start);
        setEndDate(end);
        setActivePreset(label);
        setPage(1);
    };

    const handleDownloadEwb = (saleId: string) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090/api/v1';
        const token = getStoredToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const promise = fetch(`${apiUrl}/sales/${saleId}/eway-bill-pdf/`, {
            headers
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to download EWB PDF');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'EwayBill.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        });

        toast.promise(promise, {
            loading: 'Fetching E-Way Bill...',
            success: 'E-Way Bill downloaded successfully!',
            error: (err) => err.message
        });
    };

    const handleRetryEinvoice = (saleId: string) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090/api/v1';
        const token = getStoredToken();
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const promise = fetch(`${apiUrl}/sales/${saleId}/retry-einvoice/`, {
            method: 'POST',
            headers
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to retry E-Invoice');
            }
            return res.json();
        });

        toast.promise(promise, {
            loading: 'Retrying E-Invoice generation...',
            success: 'E-Invoice generated successfully!',
            error: (err) => err.message
        });
        
        promise.then(() => {
            setTimeout(() => window.location.reload(), 1500);
        }).catch(() => {});
    };

    return (
        <div className="space-y-6">
            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Complete billing & invoice history with revenue analytics</p>
                </div>
                
                {/* ── Wholesale / Retail Toggle ── */}
                <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-200/60 shadow-sm mx-auto sm:mx-0">
                    {(['ALL', 'RETAIL', 'WHOLESALE'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => { setSaleType(type); setPage(1); }}
                            className={cn(
                                "px-5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 capitalize",
                                saleType === type 
                                    ? "bg-white text-primary shadow-sm ring-1 ring-black/5" 
                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            )}
                        >
                            {type.toLowerCase()}
                        </button>
                    ))}
                </div>

                <Button 
                    onClick={() => {
                        useBillingStore.getState().resetBilling();
                        router.push('/billing');
                    }} 
                    className="shrink-0"
                >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    New Sale
                </Button>
            </div>

            {/* ── Date Filter Presets ── */}
            <div className="flex flex-wrap items-center gap-2">
                {DATE_PRESETS.map(p => (
                    <button
                        key={p.label}
                        onClick={() => applyPreset(p.start, p.end, p.label)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                            activePreset === p.label
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                        )}
                    >
                        {p.label}
                    </button>
                ))}
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setActivePreset('Custom'); setPage(1); }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary/60"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setActivePreset('Custom'); setPage(1); }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary/60"
                    />
                </div>
            </div>

            {/* ── Selected Range Label ── */}
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                    📅 Showing: {startDate === endDate ? format(new Date(startDate), 'dd MMM yyyy') : `${format(new Date(startDate), 'dd MMM yyyy')} → ${format(new Date(endDate), 'dd MMM yyyy')}`}
                </span>
                {isLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>}
            </div>

            {/* ── Revenue Analytics Section ── */}
            <div className="bg-gradient-to-br from-primary/5 to-blue-50/50 border border-primary/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-bold text-primary uppercase tracking-wide">
                        {saleType === 'ALL' ? 'Sales & Profit Analytics' : `${saleType} Sales Analytics`}
                    </h2>
                    <span className="ml-auto text-xs text-muted-foreground">
                        {isSearching
                            ? `Search results: ${totalBills} bills (all dates)`
                            : `Based on ${totalBills} bills · ${activePreset === 'Custom' ? 'custom range' : activePreset.toLowerCase()}`
                        }
                    </span>
                </div>

                {/* How revenue and profit are calculated — explained */}
                <p className="text-xs text-slate-500 bg-white/80 rounded-lg px-3 py-2 border border-slate-100">
                    💡 <strong>Revenue</strong> = Grand Total of all invoices (incl. GST). <strong>Cost</strong> = purchase rate × qty from batch records. <strong>Profit</strong> = Revenue − Cost. Numbers are server-computed for the exact selected date range.
                </p>

                {/* Main Revenue Metrics — 5 cards */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Total Sales</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-primary tabular-nums">{fmtShort(totalRevenue)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">{totalBills} bills (incl. GST)</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Collected</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtShort(collectedTotal)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">Cash + UPI + Card</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Tag className="w-4 h-4 text-orange-500 shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Credit Pending</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-orange-600 tabular-nums">{fmtShort(creditTotal)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">Not yet collected</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
                            <p className="text-xs text-muted-foreground font-medium">Avg Bill Value</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className="text-2xl font-bold text-blue-700 tabular-nums">{fmtShort(avgBillValue)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">Per bill average</p>
                    </div>

                    {/* ── Profit Card ── */}
                    <div className={cn(
                        'rounded-xl border p-4 shadow-sm',
                        totalProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    )}>
                        <div className="flex items-center gap-2 mb-2">
                            <ArrowUpRight className={cn('w-4 h-4 shrink-0', totalProfit >= 0 ? 'text-green-600' : 'text-red-600')} />
                            <p className="text-xs text-muted-foreground font-medium">Our Profit</p>
                        </div>
                        {isLoading
                            ? <div className="h-7 bg-slate-100 animate-pulse rounded" />
                            : <p className={cn('text-2xl font-bold tabular-nums', totalProfit >= 0 ? 'text-green-700' : 'text-red-700')}>{fmtShort(totalProfit)}</p>
                        }
                        <p className="text-[10px] text-muted-foreground mt-1">
                            {isLoading ? '...' : `Sale − Cost · ${profitMarginPct.toFixed(1)}% margin`}
                        </p>
                    </div>
                </div>

                {/* Payment mode breakdown */}
                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Mode Breakdown</p>
                        {currentPaymentMode !== 'all' && (
                            <button
                                onClick={() => handlePaymentModeChange('all')}
                                className="text-xs text-primary hover:underline font-medium"
                            >
                                Clear payment filter
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { label: 'Cash', value: 'cash', amount: cashTotal, icon: Banknote, color: 'text-emerald-700', activeRing: 'ring-2 ring-emerald-500 bg-emerald-50/50', bar: 'bg-emerald-500' },
                            { label: 'UPI', value: 'upi', amount: upiTotal, icon: Smartphone, color: 'text-blue-700', activeRing: 'ring-2 ring-blue-500 bg-blue-50/50', bar: 'bg-blue-500' },
                            { label: 'Card', value: 'card', amount: cardTotal, icon: CreditCard, color: 'text-purple-700', activeRing: 'ring-2 ring-purple-500 bg-purple-50/50', bar: 'bg-purple-500' },
                            { label: 'Credit', value: 'credit', amount: creditTotal, icon: Tag, color: 'text-orange-700', activeRing: 'ring-2 ring-orange-500 bg-orange-50/50', bar: 'bg-orange-500' },
                        ].map(({ label, value, amount, icon: Icon, color, activeRing, bar }) => {
                            const isSelected = currentPaymentMode === value;
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => handlePaymentModeChange(isSelected ? 'all' : value)}
                                    className={cn(
                                        'text-left space-y-1.5 p-2 rounded-xl border transition-all cursor-pointer group',
                                        isSelected
                                            ? activeRing
                                            : 'border-transparent hover:bg-slate-50'
                                    )}
                                    title={isSelected ? `Clear ${label} filter` : `Filter table by ${label}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Icon className={cn('w-3.5 h-3.5 shrink-0', color)} />
                                            <span className="text-xs font-medium text-muted-foreground group-hover:text-slate-900 transition-colors">{label}</span>
                                        </div>
                                        {isSelected && (
                                            <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 uppercase">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className={cn(bar, 'h-full rounded-full transition-all duration-700')}
                                            style={{ width: totalRevenue > 0 ? `${Math.min(100, (amount / totalRevenue) * 100)}%` : '0%' }}
                                        />
                                    </div>
                                    <p className={cn('text-sm font-bold tabular-nums', color)}>
                                        {isLoading ? '—' : fmt(amount)}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                    {/* GST + Discount info */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Total GST Collected: <strong className="text-slate-700">{fmt(totalGst)}</strong></span>
                        <span>Total Discount Given: <strong className="text-red-600">−{fmt(totalDiscount)}</strong></span>
                    </div>
                </div>
            </div>

            {/* ── Search, Payment Filter & Sort ── */}
            <div className="flex flex-col gap-2.5 w-full">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    {/* Big Prominent Search Bar */}
                    <div className={cn(
                        'flex-1 flex items-center gap-3 bg-white border rounded-xl px-4 h-11 transition-all shadow-xs',
                        isSearching
                            ? 'border-primary/60 ring-2 ring-primary/10 bg-primary/[0.01]'
                            : 'border-slate-200/90 hover:border-slate-300 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10'
                    )}>
                        <Search className={cn('w-4 h-4 shrink-0 transition-colors', isSearching ? 'text-primary' : 'text-slate-400')} />
                        <input
                            type="text"
                            placeholder="Search by invoice #, customer name, mobile number, doctor, hospital, staff..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400 text-slate-900 font-normal"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
                                title="Clear search"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Filter & Sort Controls */}
                    <div className="flex items-center gap-2.5 shrink-0">
                        {/* Payment Mode Selector */}
                        <Select value={currentPaymentMode} onValueChange={handlePaymentModeChange}>
                            <SelectTrigger className="h-11 min-w-[155px] px-3.5 bg-white text-xs font-medium border border-slate-200/90 rounded-xl shadow-xs hover:bg-slate-50 hover:border-slate-300 focus:ring-2 focus:ring-primary/10 transition-all">
                                <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-slate-400 text-xs font-normal shrink-0">Payment:</span>
                                    <SelectValue placeholder="All Payments" />
                                </div>
                            </SelectTrigger>
                            <SelectContent align="end" className="text-xs rounded-xl border-slate-200 shadow-md py-1 min-w-[160px]">
                                {PAYMENT_FILTER_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-xs font-medium cursor-pointer py-1.5">
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <SortDropdown
                            options={SALES_SORT_OPTIONS}
                            defaultValue="-invoice_date"
                            onChange={() => setPage(1)}
                            showIcon={false}
                            triggerClassName="h-11 min-w-[150px] px-3.5 bg-white text-xs font-medium border border-slate-200/90 rounded-xl shadow-xs hover:bg-slate-50 hover:border-slate-300 focus:ring-2 focus:ring-primary/10 transition-all"
                            className="shrink-0"
                        />
                    </div>
                </div>

                {/* Active Filter Chips */}
                {(isSearching || currentPaymentMode !== 'all') && (
                    <div className="flex flex-wrap items-center gap-2 px-0.5 text-xs">
                        <span className="text-slate-400 text-xs font-medium">Active filters:</span>
                        {isSearching && (
                            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg text-xs font-medium">
                                <span>Search: &ldquo;{search}&rdquo; (all dates)</span>
                                <button
                                    onClick={() => setSearch('')}
                                    className="hover:text-primary/70 p-0.5 rounded transition-colors"
                                    title="Clear search"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </span>
                        )}
                        {currentPaymentMode !== 'all' && (
                            <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium capitalize">
                                <span>Payment: {currentPaymentMode.replace('_', ' ')}</span>
                                <button
                                    onClick={() => handlePaymentModeChange('all')}
                                    className="hover:text-slate-900 p-0.5 rounded transition-colors"
                                    title="Clear payment filter"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </span>
                        )}
                        <button
                            onClick={() => {
                                setSearch('');
                                handlePaymentModeChange('all');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 ml-1 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>
                )}
            </div>

            {/* ── Table ── */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Invoice No</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Date</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Customer</th>
                                {saleType === 'WHOLESALE' ? (
                                    <>
                                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">GSTIN</th>
                                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">E-Way Bill</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Doctor</th>
                                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Hospital</th>
                                    </>
                                )}
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs text-right">Items</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs text-right">Amount</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Payment</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs">Billed By</th>
                                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading && [...Array(6)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {[...Array(10)].map((_, j) => (
                                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                                    ))}
                                </tr>
                            ))}
                            {!isLoading && filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">
                                        <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                                        <p className="font-medium">No sales found</p>
                                        <p className="text-xs mt-1">Try changing the date range or search query</p>
                                    </td>
                                </tr>
                            )}
                            {!isLoading && filteredInvoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                                        <div className="flex flex-col gap-1 items-start">
                                            <span>{inv.invoiceNo}</span>
                                            {saleType === 'ALL' && (
                                                <span className={cn(
                                                    "text-[9px] px-1.5 py-0.5 rounded-sm border uppercase font-medium tracking-wide",
                                                    inv.saleType?.toUpperCase() === 'WHOLESALE' 
                                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                )}>
                                                    {inv.saleType?.toUpperCase() || 'RETAIL'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{format(new Date(inv.invoiceDate), 'dd MMM yyyy')}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-slate-700">{inv.customer?.name ?? 'Walk-in'}</span>
                                        </div>
                                    </td>
                                    {saleType === 'WHOLESALE' ? (
                                        <>
                                            <td className="px-4 py-3 text-slate-600 text-xs font-mono">{inv.customer?.gstin ?? '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn(
                                                    "text-[10px] px-2 py-0.5 rounded-full border uppercase font-semibold",
                                                    inv.eway_bill_status === 'GENERATED' ? "bg-green-50 text-green-700 border-green-200" :
                                                    inv.eway_bill_status === 'FAILED' ? "bg-red-50 text-red-700 border-red-200" :
                                                    "bg-slate-50 text-slate-600 border-slate-200"
                                                )}>
                                                    {inv.eway_bill_status || 'N/A'}
                                                </span>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 text-slate-600">{inv.doctorName ?? '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{inv.hospitalName ?? '—'}</td>
                                        </>
                                    )}
                                    <td className="px-4 py-3 text-right text-slate-600">{inv.itemsCount ?? inv.items?.length ?? 0}</td>
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{fmt(inv.grandTotal)}</td>
                                    <td className="px-4 py-3">
                                        <PaymentBreakdownCell
                                            paymentMode={inv.paymentMode}
                                            cashPaid={inv.cashPaid}
                                            upiPaid={inv.upiPaid}
                                            cardPaid={inv.cardPaid}
                                            creditGiven={inv.creditGiven}
                                            bankPaid={inv.bankPaid}
                                            chequePaid={inv.chequePaid}
                                            payments={inv.payments}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-xs">{inv.billedByName ?? '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {inv.eway_bill_no && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Download E-Way Bill" onClick={() => handleDownloadEwb(inv.id)}>
                                                    <Download className="w-4 h-4" />
                                                </Button>
                                            )}
                                            {(inv.irnStatus === 'FAILED' || (inv as any).irn_status === 'FAILED') && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50" title="Retry E-Invoice Generation" onClick={() => handleRetryEinvoice(inv.id)}>
                                                    <RefreshCw className="w-4 h-4" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View Invoice" onClick={() => setSelectedInvoiceId(inv.id)}>
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Print Invoice" onClick={() => setSelectedInvoiceId(inv.id)}>
                                                <Printer className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
                        <p className="text-xs text-muted-foreground">
                            Page {pagination.page} of {pagination.totalPages} · {pagination.totalRecords} total records
                        </p>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Invoice Modal */}
            {selectedInvoiceId && (
                <SaleInvoiceModal 
                    invoiceId={selectedInvoiceId} 
                    onClose={() => setSelectedInvoiceId(null)} 
                    onEdit={canEdit ? handleEditSale : undefined} 
                    onViewHistory={() => router.push(`/dashboard/sales/revisions/${selectedInvoiceId}`)}
                />
            )}
        </div>
    );
}
