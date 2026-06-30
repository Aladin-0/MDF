'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft, Pencil, Heart, Phone,
    Building2, Receipt,
    ChevronDown, FileText, Package, AlertCircle, Loader2, IndianRupee, Repeat
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CustomerForm from '@/components/customers/CustomerForm';
import { useCustomerById } from '@/hooks/useCustomers';
import { useCustomerInvoices, useInvoiceItems } from '@/hooks/useSales';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/lib/gst';
import { formatQty, cn } from '@/lib/utils';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Customer, SaleInvoiceSummary, SaleInvoice } from '@/types';
import { salesApi } from '@/lib/apiClient';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';
import RecordCreditPaymentModal from '@/components/credit/RecordCreditPaymentModal';
import { useCreditAccounts } from '@/hooks/useCredit';

const API_URL = process.env.NEXT_PUBLIC_API_URL!; // Required — set NEXT_PUBLIC_API_URL in .env

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DetailRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
    return (
        <div className="flex items-start justify-between py-2.5 border-b last:border-b-0">
            <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
            <span className={cn('text-sm font-medium text-right', className)}>{value || '—'}</span>
        </div>
    );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    return (
        <div className="bg-white rounded-xl border p-4">
            <div className={cn('text-xs font-medium mb-1', color)}>{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
    );
}

type StatusFilter = 'all' | 'paid' | 'credit' | 'partial' | 'return';
type PeriodFilter = 'this_month' | 'last_month' | 'last_3_months' | 'all';

const PAGE_SIZE = 10;

function getInvoiceStatus(inv: SaleInvoiceSummary): StatusFilter {
    if (inv.isReturn) return 'return';
    if (inv.amountDue <= 0) return 'paid';
    if (inv.paymentMode === 'credit') return 'credit';
    return 'partial';
}

const STATUS_CONFIG: Record<StatusFilter, { label: string; classes: string }> = {
    paid:    { label: 'Paid',    classes: 'bg-green-100 text-green-700 border-green-200' },
    partial: { label: 'Partial', classes: 'bg-amber-100 text-amber-700 border-amber-200' },
    credit:  { label: 'Credit',  classes: 'bg-red-100 text-red-700 border-red-200' },
    return:  { label: 'Return',  classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    all:     { label: 'All',     classes: '' },
};

function getPeriodStart(period: PeriodFilter): Date | null {
    const today = new Date();
    if (period === 'this_month') return startOfMonth(today);
    if (period === 'last_month') return startOfMonth(subMonths(today, 1));
    if (period === 'last_3_months') return startOfMonth(subMonths(today, 3));
    return null;
}

// ─── Expanded Item Row ─────────────────────────────────────────────────────────

function InvoiceItemsExpanded({ invoiceId }: { invoiceId: string }) {
    const { data, isLoading, isError } = useInvoiceItems(invoiceId);
    const items = data?.data ?? [];

    if (isLoading) {
        return (
            <div className="px-6 py-4">
                <Skeleton className="h-10 w-full rounded-lg" />
            </div>
        );
    }

    if (isError || items.length === 0) {
        return (
            <div className="px-6 py-4 flex items-center gap-2 text-slate-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                Could not load item details
            </div>
        );
    }

    return (
        <div className="px-6 py-4 bg-slate-50/50">
            <table className="w-full text-sm text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                        <th className="pb-2 font-medium w-8">#</th>
                        <th className="pb-2 font-medium">Product</th>
                        <th className="pb-2 font-medium">Batch</th>
                        <th className="pb-2 font-medium">Exp</th>
                        <th className="pb-2 font-medium text-right">MRP</th>
                        <th className="pb-2 font-medium text-right">Qty</th>
                        <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                    {items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                            <td className="py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                            <td className="py-2.5 font-medium text-slate-800">{item.productName}</td>
                            <td className="py-2.5 text-slate-500 font-mono text-xs">{item.batchNo || '—'}</td>
                            <td className="py-2.5 text-slate-500 text-xs">{item.expiryDate ? format(new Date(item.expiryDate), 'MM/yy') : '—'}</td>
                            <td className="py-2.5 text-right text-slate-600">{formatINR(item.rate)}</td>
                            <td className="py-2.5 text-right text-slate-700">{formatQty(item.qtyStrips, item.qtyLoose, item.packSize ?? null)}</td>
                            <td className="py-2.5 text-right font-semibold text-slate-900">{formatINR(item.totalAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Invoice History Section ───────────────────────────────────────────────────

function InvoiceHistory({ customerId }: { customerId: string }) {
    const router = useRouter();
    const { data, isLoading } = useCustomerInvoices(customerId);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [period, setPeriod] = useState<PeriodFilter>('this_month');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [autoExpandedKey, setAutoExpandedKey] = useState<string>('');
    const [page, setPage] = useState(1);

    const [selectedPrintInvoice, setSelectedPrintInvoice] = useState<SaleInvoice | null>(null);
    const [isPrintLoading, setIsPrintLoading] = useState<string | null>(null);

    const handlePrintInvoiceClick = async (invoiceId: string) => {
        try {
            setIsPrintLoading(invoiceId);
            const userOutletId = useAuthStore.getState().outlet?.id || '';
            const invoice = await salesApi.getById(invoiceId, userOutletId);
            setSelectedPrintInvoice({
                ...invoice,
                items: invoice.items || [],
            });
        } catch (error) {
            console.error('Failed to load invoice for printing:', error);
        } finally {
            setIsPrintLoading(null);
        }
    };

    const [isRepeatLoading, setIsRepeatLoading] = useState<string | null>(null);

    const handleRepeatOrder = async (invoiceId: string) => {
        try {
            const store = useBillingStore.getState();
            // Check if there is already an active draft for this invoice
            const existingDraft = Object.values(store.drafts).find(d => d.sourceInvoiceId === invoiceId);
            if (existingDraft) {
                store.switchDraft(existingDraft.id);
                router.push('/dashboard/billing');
                return;
            }

            setIsRepeatLoading(invoiceId);
            const userOutletId = useAuthStore.getState().outlet?.id || '';
            const invoice = await salesApi.getById(invoiceId, userOutletId);
            const { API_URL, getHeaders } = await import('@/lib/apiClient');
            
            // Call batch availability check
            const batchCheckPayload = (invoice.items || []).map((item: any) => ({
                batchId: item.batchId || item.batch,
                qtyStrips: Number(item.qtyStrips || item.qty_strips || 0),
                qtyLoose: Number(item.qtyLoose || item.qty_loose || 0)
            }));
            
            let batchStatuses: Record<string, any> = {};
            if (batchCheckPayload.length > 0) {
                const checkRes = await fetch(`${API_URL}/inventory/batches/availability-check/`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify(batchCheckPayload)
                });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    checkData.forEach((res: any) => {
                        batchStatuses[res.batchId] = res;
                    });
                }
            }

            const draftId = store.createDraft();
            store.switchDraft(draftId);
            
            // Set invoice mode
            store.setDraftDocumentMode(draftId, 'invoice');
            store.setDraftValidUntil(draftId, undefined);
            store.updateDraftHeader(draftId, { 
                sourceInvoiceId: invoice.id,
                sourceInvoiceNo: invoice.invoiceNo,
                hospitalName: invoice.hospitalName || null,
                doctor: invoice.doctorName ? { id: 'mock', name: invoice.doctorName } as any : null,
                extraDiscountPct: 0 // Note: Re-calculate or default to 0 if unsupported
            });
            
            if (invoice.customer) {
                store.setCustomer(invoice.customer);
                store.setCustomerLedger({
                    id: 'mock',
                    name: invoice.customer.name || 'Unknown',
                    groupName: 'Sundry Debtors',
                    currentBalance: 0,
                    isMock: true,
                } as any);
            }
            
            if (invoice.items) {
                invoice.items.forEach((item: any) => {
                    const mrp         = Number(item.mrp     || item.rate || 0);
                    const rate        = Number(item.rate    || 0);
                    const saleRate    = Number(item.saleRate|| item.rate || 0);
                    const discountPct = Number(item.discountPct || item.discount_pct || 0);
                    const gstRate     = Number(item.gstRate || item.gst_rate || 0);
                    const qtyStrips   = Number(item.qtyStrips || item.qty_strips || 0);
                    const qtyLoose    = Number(item.qtyLoose  || item.qty_loose  || 0);
                    const packSize    = Number(item.packSize   || item.pack_size  || 1);
                    const taxableAmount = Number(item.taxableAmount || item.taxable_amount || 0);
                    const gstAmount     = Number(item.gstAmount     || item.gst_amount     || 0);
                    const totalAmount   = Number(item.totalAmount   || item.total_amount   || 0);
                    const landingRate   = Number(item.landingRate   || item.landing_rate   || 0);
                    const costRate      = Number(item.costRate      || item.cost_rate      || 0);

                    const batchId = item.batchId || item.batch;
                    const batchInfo = batchStatuses[batchId];

                    store.addToCart(draftId, {
                        ...item,
                        name: item.medicineName || item.medicine_name || item.name || '',
                        mrp, rate, saleRate, discountPct, gstRate, qtyStrips, qtyLoose, packSize,
                        taxableAmount, gstAmount, totalAmount, landingRate, costRate,
                        totalQty: qtyStrips + (qtyLoose / packSize),
                        saleMode: item.saleMode || 'strip',
                        cgst: item.cgstRate || (gstRate ? gstRate / 2 : 0),
                        sgst: item.sgstRate || (gstRate ? gstRate / 2 : 0),
                        batchId:      batchId,
                        productId:    item.productId    || item.product,
                        medicineName: item.medicineName || item.medicine_name,
                        batchNo:      item.batchNo      || item.batch_no,
                        expiryDate:   item.expiryDate   || item.expiry_date || '',
                        batchAvailabilityStatus: batchInfo?.status || 'AVAILABLE',
                        availableStock: batchInfo ? (batchInfo.availableQtyStrips * packSize + batchInfo.availableQtyLoose) : undefined
                    } as any);
                });
            }
            
            router.push('/dashboard/billing');
            toast({ title: 'Repeat Order', description: 'Invoice loaded into draft.' });
        } catch (error: any) {
            console.error('Failed to prepare invoice for repeat:', error);
            const message = error?.detail || error?.message || 'Failed to prepare invoice for repeat';
            toast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setIsRepeatLoading(null);
        }
    };

    const allInvoices: SaleInvoiceSummary[] = data?.data ?? [];

    // Summary cards (calculated from ALL invoices, not filtered)
    const totalBills = allInvoices.length;
    const totalBilled = allInvoices.reduce((s, inv) => s + inv.grandTotal, 0);
    const totalOutstanding = data?.analytics?.customerOutstanding ?? allInvoices.reduce((s, inv) => s + (inv.amountDue ?? 0), 0);

    // Period filter
    const periodStart = getPeriodStart(period);
    const periodEnd = period === 'last_month'
        ? startOfMonth(new Date())  // last month ends at start of this month
        : null;

    const periodInvoices = useMemo(() => {
        if (!periodStart) return allInvoices;
        return allInvoices.filter((inv) => {
            const d = new Date(inv.invoiceDate);
            if (periodEnd && d >= periodEnd) return false;
            return d >= periodStart;
        });
    }, [allInvoices, periodStart, periodEnd]);

    // Status filter
    const filtered = useMemo(() => {
        if (statusFilter === 'all') return periodInvoices;
        return periodInvoices.filter((inv) => getInvoiceStatus(inv) === statusFilter);
    }, [periodInvoices, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const resetPage = () => setPage(1);

    // Auto-expand ALL visible invoices on load or filter change
    useEffect(() => {
        const currentKey = `${statusFilter}-${period}-${page}-${paginated.length > 0 ? paginated[0].id : 'empty'}`;
        if (autoExpandedKey !== currentKey) {
            // Expand all rows in current paginated view
            setExpandedIds(new Set(paginated.map(inv => inv.id)));
            setAutoExpandedKey(currentKey);
        }
    }, [paginated, statusFilter, period, page, autoExpandedKey]);

    const toggleRow = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Summary cards skeleton
    if (isLoading) {
        return (
            <div className="space-y-6 mt-6">
                <div className="grid grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Invoice History Table */}
            <div>
                {/* Filter bar */}
                <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        {(['all', 'paid', 'credit', 'partial', 'return'] as StatusFilter[]).map((s) => {
                            const isActive = statusFilter === s;
                            const count = s === 'all'
                                ? periodInvoices.length
                                : periodInvoices.filter((inv) => getInvoiceStatus(inv) === s).length;
                            return (
                                <button
                                    key={s}
                                    onClick={() => { setStatusFilter(s); resetPage(); }}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
                                        isActive
                                            ? 'bg-foreground text-background border-foreground shadow-sm'
                                            : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/40'
                                    )}
                                >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                    <span className={cn(
                                        'inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[16px] h-4 px-1',
                                        isActive ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
                                    )}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <Select value={period} onValueChange={(v) => { setPeriod(v as PeriodFilter); resetPage(); }}>
                        <SelectTrigger className="w-40 h-9 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-slate-300 shadow-sm overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 border-b-2 border-slate-200 sticky top-0 z-10 text-slate-700">
                                <tr>
                                    <th className="w-10" />
                                    <th className="text-left px-4 py-3.5 font-semibold whitespace-nowrap">Date</th>
                                    <th className="text-left px-4 py-3.5 font-semibold whitespace-nowrap">Invoice No</th>
                                    <th className="text-right px-4 py-3.5 font-semibold whitespace-nowrap">Items</th>
                                    <th className="text-right px-4 py-3.5 font-semibold whitespace-nowrap">Total</th>
                                    <th className="text-right px-4 py-3.5 font-semibold whitespace-nowrap">Paid</th>
                                    <th className="text-right px-4 py-3.5 font-semibold whitespace-nowrap">Due</th>
                                    <th className="text-center px-4 py-3.5 font-semibold whitespace-nowrap">Status</th>
                                    <th className="text-right px-4 py-3.5 font-semibold whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {paginated.length === 0 ? (
                                    <tr>
                                        <td colSpan={9}>
                                            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                                    <Receipt className="h-6 w-6" />
                                                </div>
                                                <div className="text-center">
                                                    {allInvoices.length === 0 ? (
                                                        <>
                                                            <p className="font-medium text-foreground">No invoices found for this customer</p>
                                                            <p className="text-sm mt-0.5">Bills created for this customer will appear here</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="font-medium text-foreground">No invoices match the selected filters</p>
                                                            <button
                                                                onClick={() => { setStatusFilter('all'); setPeriod('all'); setPage(1); }}
                                                                className="text-sm mt-1 text-blue-600 hover:underline"
                                                            >
                                                                Clear Filters
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginated.map((inv) => {
                                        const invStatus = getInvoiceStatus(inv);
                                        const cfg = STATUS_CONFIG[invStatus];
                                        const isExpanded = expandedIds.has(inv.id);

                                        return (
                                            <Fragment key={inv.id}>
                                                <tr
                                                    className={cn(
                                                        'cursor-pointer transition-colors hover:bg-slate-50',
                                                        isExpanded ? 'bg-slate-50' : 'bg-white'
                                                    )}
                                                    onClick={() => toggleRow(inv.id)}
                                                >
                                                    <td className="pl-3 pr-0 py-3.5 text-slate-400">
                                                        <ChevronDown className={cn(
                                                            'w-4 h-4 transition-transform duration-200',
                                                            !isExpanded && '-rotate-90'
                                                        )} />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-600 font-medium whitespace-nowrap">
                                                        {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                                                    </td>
                                                    <td className="px-4 py-3.5 font-mono text-xs text-slate-900 font-semibold whitespace-nowrap">
                                                        {inv.invoiceNo}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                                                        {inv.itemsCount} item{inv.itemsCount !== 1 ? 's' : ''}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                                        {formatINR(inv.grandTotal)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums text-emerald-600 font-medium whitespace-nowrap">
                                                        {formatINR(inv.amountPaid)}
                                                    </td>
                                                    <td className={cn(
                                                        'px-4 py-3.5 text-right tabular-nums whitespace-nowrap',
                                                        inv.amountDue > 0 ? 'text-red-600 font-bold' : 'text-slate-400'
                                                    )}>
                                                        {inv.amountDue > 0 ? formatINR(inv.amountDue) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        <span className={cn(
                                                            'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border',
                                                            cfg.classes
                                                        )}>
                                                            {cfg.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1.5 h-8 px-2"
                                                                disabled={isRepeatLoading === inv.id || isPrintLoading === inv.id}
                                                                onClick={async () => {
                                                                    await handleRepeatOrder(inv.id);
                                                                }}
                                                            >
                                                                {isRepeatLoading === inv.id ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <Repeat className="w-3.5 h-3.5" />
                                                                )}
                                                                Order Again
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-slate-600 hover:text-blue-700 hover:bg-blue-50 border-slate-200 gap-1.5 h-8 px-2"
                                                                disabled={isPrintLoading === inv.id || isRepeatLoading === inv.id}
                                                                onClick={async () => {
                                                                    await handlePrintInvoiceClick(inv.id);
                                                                }}
                                                            >
                                                                {isPrintLoading === inv.id ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <FileText className="w-3.5 h-3.5" />
                                                                )}
                                                                PDF
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-slate-50 border-l-4 border-l-primary/60">
                                                        <td colSpan={9} className="px-0 py-0 border-t border-slate-200 shadow-inner">
                                                            <div className="pl-8 pr-4 py-4">
                                                                <InvoiceItemsExpanded invoiceId={inv.id} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground mt-4">
                        <span>
                            Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline" size="sm" className="h-8 w-8 p-0"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                ‹
                            </Button>
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
            </div>

            <InvoicePreviewModal
                isOpen={!!selectedPrintInvoice}
                onClose={() => setSelectedPrintInvoice(null)}
                invoice={selectedPrintInvoice}
            />
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
    const billingStore = useBillingStore();
    const router = useRouter();

    const { id } = useParams<{ id: string }>();
    const { data: customer, isLoading, isError } = useCustomerById(id);
    const { data: creditAccountsData } = useCreditAccounts();
    const setCustomer = useBillingStore((s) => s.setCustomer);
    const [editOpen, setEditOpen] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);

    const creditAccounts = Array.isArray(creditAccountsData) ? creditAccountsData : (creditAccountsData as any)?.data ?? [];
    const creditAccount = creditAccounts.find((a: any) => a.customer?.id === id);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <div className="flex gap-6">
                    <div className="w-1/3 space-y-4">
                        <Skeleton className="h-48 rounded-xl" />
                        <Skeleton className="h-48 rounded-xl" />
                    </div>
                    <div className="w-2/3">
                        <Skeleton className="h-96 rounded-xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (isError || !customer) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                <p className="text-lg font-medium">Customer not found</p>
                <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go back
                </Button>
            </div>
        );
    }

    const creditUsedPct = customer.creditLimit > 0
        ? Math.min((customer.outstanding / customer.creditLimit) * 100, 100)
        : 0;

    return (
        <div className="space-y-6">
            {/* Back + compact header */}
            <div className="flex items-center gap-4 bg-white p-4 rounded-xl border">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {customer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-slate-900 leading-none">{customer.name}</h1>
                            {customer.isChronic && (
                                <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1 h-5 px-1.5 text-[10px]">
                                    <Heart className="w-2.5 h-2.5 fill-current" /> Chronic
                                </Badge>
                            )}
                            {customer.outstanding > 0 && (
                                <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 h-5 px-1.5 text-[10px]">
                                    Due: {formatCurrency(customer.outstanding)}
                                </Badge>
                            )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5" /> {customer.phone}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                    </Button>
                    {customer.outstanding > 0 && creditAccount && (
                        <Button variant="outline" size="sm" className="text-amber-700 border-amber-200 hover:bg-amber-50" onClick={() => setPaymentOpen(true)}>
                            <IndianRupee className="w-3.5 h-3.5 mr-2" /> Collect Payment
                        </Button>
                    )}
                    <Button size="sm" onClick={() => { setCustomer(customer as any); router.push('/billing'); }}>
                        <Receipt className="w-3.5 h-3.5 mr-2" /> Quick Bill
                    </Button>
                </div>
            </div>

            {/* Two-column layout */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Left Column (30%) - Secondary info */}
                <div className="w-full lg:w-1/3 space-y-4 shrink-0">
                    <Card className="shadow-sm">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Lifetime Spend</span>
                                <span className="font-semibold">{formatCurrency(customer.totalPurchases)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Outstanding</span>
                                <span className={cn("font-semibold", customer.outstanding > 0 ? "text-red-600" : "text-green-600")}>
                                    {formatCurrency(customer.outstanding)}
                                </span>
                            </div>
                            {customer.creditLimit > 0 && (
                                <div className="space-y-1.5 mt-2 pt-2 border-t">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Credit Limit: {formatCurrency(customer.creditLimit)}</span>
                                        <span>{creditUsedPct.toFixed(0)}% used</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className={cn('h-full rounded-full transition-all',
                                                creditUsedPct > 80 ? 'bg-red-500' : creditUsedPct > 50 ? 'bg-amber-500' : 'bg-green-500'
                                            )}
                                            style={{ width: `${creditUsedPct}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardContent className="p-4 space-y-2">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Contact Info</div>
                            <div className="text-sm"><span className="text-muted-foreground inline-block w-20">Address:</span> {customer.address || '—'}</div>
                            <div className="text-sm"><span className="text-muted-foreground inline-block w-20">DOB:</span> {customer.dob ? format(new Date(customer.dob), 'dd MMM yyyy') : '—'}</div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardContent className="p-4 space-y-2">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Business</div>
                            <div className="text-sm"><span className="text-muted-foreground inline-block w-20">GSTIN:</span> {customer.gstin ? <span className="font-mono">{customer.gstin}</span> : '—'}</div>
                            <div className="text-sm"><span className="text-muted-foreground inline-block w-20">Discount:</span> {customer.fixedDiscount}%</div>
                            <div className="text-sm">
                                <span className="text-muted-foreground inline-block w-20">Status:</span> 
                                <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-sm', customer.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                                    {customer.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div className="text-sm"><span className="text-muted-foreground inline-block w-20">Registered:</span> {format(new Date(customer.createdAt), 'dd MMM yyyy')}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column (70%) - Main content */}
                <div className="w-full lg:w-2/3">
                    {/* Invoice History is now the primary content area */}
                    <div className="bg-white rounded-xl border p-4 shadow-sm">
                        <InvoiceHistory customerId={id} />
                    </div>
                </div>
            </div>

            {/* Modals */}
            <CustomerForm
                open={editOpen}
                onClose={() => setEditOpen(false)}
                customer={customer as Customer}
            />
            {creditAccount && (
                <RecordCreditPaymentModal
                    isOpen={paymentOpen}
                    accountId={creditAccount.id}
                    onClose={() => setPaymentOpen(false)}
                />
            )}
        </div>
    );
}
