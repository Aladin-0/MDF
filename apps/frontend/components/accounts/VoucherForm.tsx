'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, AlertCircle, CheckSquare, Square, MinusSquare, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi } from '@/lib/apiClient';
import { api } from '@/lib/api';
import { Ledger, Voucher, PendingBill } from '@/types';
import { cn } from '@/lib/utils';
import { buildVoucherPayload } from '@/utils/payloadBuilders';
import { VoucherLinesGrid, VoucherLineRow } from './VoucherLinesGrid';

type VoucherType = 'receipt' | 'payment' | 'contra' | 'journal';

interface VoucherFormProps {
    initialType?: VoucherType;
    voucherId?: string;
    onSuccess?: (voucher: Voucher) => void;
}

const TYPE_LABELS: Record<VoucherType, string> = {
    receipt: 'Receipt',
    payment: 'Payment',
    contra: 'Contra',
    journal: 'Journal',
};

const TYPE_SHORTCUTS: Record<string, VoucherType> = {
    F6: 'receipt',
    F5: 'payment',
    F4: 'contra',
    F7: 'journal',
};

const REASON_CODES = [
    { value: 'MODIFIED', label: 'General Modification' },
    { value: 'AMOUNT_CORRECTION', label: 'Amount Correction' },
    { value: 'LEDGER_CORRECTION', label: 'Ledger Correction' },
    { value: 'DATE_CORRECTION', label: 'Date Correction' },
    { value: 'NARRATION_UPDATE', label: 'Narration Update' },
];

function fmt(n: number) {
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VoucherForm({ initialType = 'receipt', voucherId, onSuccess }: VoucherFormProps) {
    const outletId = useOutletId();
    const { toast } = useToast();

    const [voucherType, setVoucherType] = useState<VoucherType>(initialType);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [voucherNo, setVoucherNo] = useState('');
    const [narration, setNarration] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadingNo, setLoadingNo] = useState(false);
    const [loadingVoucher, setLoadingVoucher] = useState(!!voucherId);
    const [globalError, setGlobalError] = useState<string | null>(null);

    // Revision state
    const [originalStatus, setOriginalStatus] = useState<string>('draft');
    const [reasonCode, setReasonCode] = useState('');
    const [reasonText, setReasonText] = useState('');

    // Dynamic Multi-Entry Lines State (Tally/SAP style)
    const [lines, setLines] = useState<VoucherLineRow[]>([
        { id: '1', side: 'debit', ledger: null, amount: '' },
        { id: '2', side: 'credit', ledger: null, amount: '' }
    ]);

    // Bill-by-bill state (for receipt/payment allocations)
    const [pendingBills, setPendingBills] = useState<PendingBill[]>([]);
    const [billAmounts, setBillAmounts] = useState<Record<string, string>>({});
    const [loadingBills, setLoadingBills] = useState(false);
    const [showAllBills, setShowAllBills] = useState(false);

    // Live Totals
    const totalDebits = lines
        .filter(l => l.side === 'debit')
        .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    const totalCredits = lines
        .filter(l => l.side === 'credit')
        .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    const diff = Math.round((totalDebits - totalCredits) * 100) / 100;
    const isBalanced = Math.abs(diff) < 0.01 && totalDebits > 0;
    const hasMinLedgers = lines.filter(l => l.ledger && (parseFloat(l.amount) || 0) > 0).length >= 2;
    const canSave = isBalanced && hasMinLedgers && !saving;

    // Detect party ledger among lines for bill adjustments
    const partyLine = lines.find(l => {
        if (!l.ledger) return false;
        const grp = (l.ledger as any)?.groupName || (l.ledger as any)?.group?.name || '';
        return grp.includes('Debtor') || grp.includes('Creditor') || grp.includes('Customer') || grp.includes('Supplier');
    }) || lines.find(l => l.ledger && !['Cash in Hand', 'Bank Accounts'].includes((l.ledger as any)?.groupName || '')) || null;
    const partyLedger = partyLine?.ledger || null;
    const partyAmount = parseFloat(partyLine?.amount || '') || 0;
    const targetAdjustAmount = partyAmount > 0
        ? partyAmount
        : (voucherType === 'payment' ? totalDebits || totalCredits : totalCredits || totalDebits);

    // Load voucher number
    useEffect(() => {
        if (!outletId || voucherId || loadingVoucher) return;
        setLoadingNo(true);
        voucherApi.getNextVoucherNo(outletId, voucherType)
            .then((d: any) => setVoucherNo(d.voucherNo || ''))
            .catch(() => {})
            .finally(() => setLoadingNo(false));
    }, [outletId, voucherType, voucherId, loadingVoucher]);

    // Load existing voucher if editing
    useEffect(() => {
        if (!voucherId || !outletId) return;
        setLoadingVoucher(true);
        api.get(`/vouchers/${voucherId}/`, { params: { outletId } })
            .then(res => {
                const data = res.data;
                setVoucherType(data.voucherType);
                setVoucherNo(data.voucherNo);
                setDate(data.date);
                setNarration(data.narration);
                setOriginalStatus(data.status || 'posted');

                if (data.lines && data.lines.length > 0) {
                    setLines(data.lines.map((l: any, idx: number) => ({
                        id: l.id || String(idx + 1),
                        side: l.debit > 0 ? 'debit' : 'credit',
                        ledger: l.ledger,
                        amount: (l.debit > 0 ? l.debit : l.credit).toString(),
                        description: l.description || '',
                    })));
                }

                if (data.billAdjustments && data.billAdjustments.length > 0) {
                    const initialBills: Record<string, string> = {};
                    data.billAdjustments.forEach((adj: any) => {
                        const id = adj.invoiceId || adj.saleInvoice || adj.purchaseInvoice;
                        if (id) {
                            initialBills[id] = adj.adjustedAmount;
                        }
                    });
                    setBillAmounts(initialBills);
                }
            })
            .catch(() => {
                setGlobalError('Failed to load voucher details. Please try again.');
                toast({ variant: 'destructive', title: 'Failed to load voucher' });
            })
            .finally(() => setLoadingVoucher(false));
    }, [voucherId, outletId]);

    // Load pending bills when party ledger changes
    useEffect(() => {
        if (!partyLedger || !outletId || (voucherType !== 'receipt' && voucherType !== 'payment')) {
            setPendingBills([]);
            setBillAmounts({});
            return;
        }
        setLoadingBills(true);
        voucherApi.getPendingBills(outletId, partyLedger.id, voucherId || undefined)
            .then((data: PendingBill[]) => {
                setPendingBills(data);
                setBillAmounts(prev => {
                    const next: Record<string, string> = {};
                    data.forEach(b => { next[b.id] = ''; });
                    Object.keys(prev).forEach(k => {
                        if (prev[k]) next[k] = prev[k];
                    });
                    return next;
                });
            })
            .catch(() => {
                setPendingBills([]);
            })
            .finally(() => setLoadingBills(false));
    }, [partyLedger, outletId, voucherType, voucherId]);

    // Keyboard shortcuts
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            const type = TYPE_SHORTCUTS[e.key];
            if (type && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault();
                setVoucherType(type);
            }
            if (e.ctrlKey && e.key === 's') { 
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault(); 
                if (canSave) handleSave(); 
            }
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [outletId, date, lines, narration, canSave]);

    function handleClear() {
        setLines([
            { id: '1', side: 'debit', ledger: null, amount: '' },
            { id: '2', side: 'credit', ledger: null, amount: '' }
        ]);
        setBillAmounts({});
        setNarration('');
        setGlobalError(null);
    }

    function toggleBillSmart(billId: string, outstanding: number) {
        setBillAmounts(prev => {
            const cur = parseFloat(prev[billId]) || 0;
            // If already allocated, clicking it deselects / clears it
            if (cur > 0) {
                return { ...prev, [billId]: '' };
            }

            // Calculate current total allocated excluding this bill
            const currentAllocated = Object.entries(prev)
                .filter(([id]) => id !== billId)
                .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0);

            if (targetAdjustAmount > 0) {
                const remaining = Math.max(0, Math.round((targetAdjustAmount - currentAllocated) * 100) / 100);
                if (remaining <= 0) {
                    toast({
                        title: 'Amount fully adjusted',
                        description: `The voucher amount of ${fmt(targetAdjustAmount)} is already fully allocated.`,
                    });
                    return prev;
                }
                const toFill = Math.min(outstanding, remaining);
                return { ...prev, [billId]: toFill.toFixed(2) };
            } else {
                return { ...prev, [billId]: outstanding.toFixed(2) };
            }
        });
    }

    function autoAllocate() {
        if (targetAdjustAmount <= 0) {
            toast({
                title: 'Enter Amount First',
                description: 'Please enter an amount in the party row to auto-adjust bills.',
            });
            return;
        }
        let remaining = targetAdjustAmount;
        const next: Record<string, string> = {};
        for (const bill of visibleBills) {
            if (remaining <= 0) {
                next[bill.id] = '';
                continue;
            }
            const toFill = Math.min(bill.outstanding, remaining);
            next[bill.id] = toFill > 0 ? toFill.toFixed(2) : '';
            remaining = Math.round((remaining - toFill) * 100) / 100;
        }
        setBillAmounts(next);
        toast({
            title: 'Bills Auto-Adjusted',
            description: `Allocated ${fmt(targetAdjustAmount)} across bills.`,
        });
    }

    function selectAll() {
        const next: Record<string, string> = {};
        pendingBills.forEach(b => { next[b.id] = b.outstanding.toFixed(2); });
        setBillAmounts(next);
    }

    function clearAll() {
        const next: Record<string, string> = {};
        pendingBills.forEach(b => { next[b.id] = ''; });
        setBillAmounts(next);
    }

    async function handleSave() {
        if (!outletId) return;

        if (!isBalanced) {
            toast({
                variant: 'destructive',
                title: 'Voucher Imbalanced',
                description: `Total Debits (₹${totalDebits.toFixed(2)}) must exactly equal Total Credits (₹${totalCredits.toFixed(2)}).`,
            });
            return;
        }

        if (!hasMinLedgers) {
            toast({
                variant: 'destructive',
                title: 'Incomplete Lines',
                description: 'Please assign valid ledgers and positive amounts to at least two lines.',
            });
            return;
        }

        if (voucherId && originalStatus === 'posted') {
            if (!reasonCode || reasonText.length < 10) {
                toast({
                    variant: 'destructive',
                    title: 'Revision Reason Required',
                    description: 'Please provide a valid reason code and explanation (min 10 chars) for this modification.',
                });
                return;
            }
        }

        setSaving(true);
        try {
            const payload = buildVoucherPayload(
                voucherType,
                date,
                narration,
                outletId,
                partyLedger,
                null,
                totalDebits,
                pendingBills,
                billAmounts,
                null,
                null,
                0,
                lines,
                voucherId,
                originalStatus,
                reasonCode,
                reasonText
            );

            let voucher;
            if (voucherId) {
                const res = await api.put(`/vouchers/${voucherId}/`, payload);
                voucher = res.data;
            } else {
                voucher = await voucherApi.createVoucher(payload);
            }

            toast({
                title: `${TYPE_LABELS[voucherType]} ${voucherId ? 'updated' : 'saved'}`,
                description: voucher.voucherNo,
            });

            if (!voucherId) {
                handleClear();
                voucherApi.getNextVoucherNo(outletId, voucherType).then((d: any) => setVoucherNo(d.voucherNo || ''));
            }
            onSuccess?.(voucher);
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Failed to save',
                description: err?.detail || String(err),
            });
        } finally {
            setSaving(false);
        }
    }

    if (loadingVoucher) {
        return (
            <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">
                Loading voucher...
            </div>
        );
    }

    const visibleBills = showAllBills
        ? pendingBills
        : pendingBills.filter(b => voucherId ? parseFloat(billAmounts[b.id]) > 0 : true);

    const billTotal = Math.round(Object.values(billAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) * 100) / 100;
    const remainingToAdjust = targetAdjustAmount > 0
        ? Math.max(0, Math.round((targetAdjustAmount - billTotal) * 100) / 100)
        : 0;
    const isFullyAdjusted = targetAdjustAmount > 0 && Math.abs(targetAdjustAmount - billTotal) < 0.01;
    const isOverAllocated = targetAdjustAmount > 0 && billTotal > targetAdjustAmount + 0.009;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN (Main Form) ── */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                {globalError && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{globalError}</span>
                    </div>
                )}

                {/* Voucher Type Tabs */}
                <div className="flex gap-2 border-b pb-3">
                    {(['receipt', 'payment', 'contra', 'journal'] as VoucherType[]).map((t) => (
                        <button
                            key={t}
                            type="button"
                            disabled={!!voucherId}
                            onClick={() => {
                                setVoucherType(t);
                                handleClear();
                            }}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                                voucherType === t
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-muted/80',
                                voucherId && voucherType !== t && 'opacity-40 cursor-not-allowed'
                            )}
                        >
                            {TYPE_LABELS[t]}
                            <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-mono',
                                voucherType === t ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                            )}>
                                {t === 'receipt' ? 'F6' : t === 'payment' ? 'F5' : t === 'contra' ? 'F4' : 'F7'}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="bg-card text-card-foreground border rounded-xl shadow-sm p-6 space-y-6">
                    {/* Date + Voucher No */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-slate-500 font-medium">Date</Label>
                            <Input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="h-11 shadow-none border-slate-200 focus-visible:ring-primary/20 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-500 font-medium">Voucher No</Label>
                            <Input
                                value={loadingNo ? 'Loading...' : voucherNo}
                                readOnly
                                className="h-11 bg-slate-50 border-slate-100 text-slate-600 font-medium shadow-none cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* ── Multi-Line Voucher Grid (Universal Dynamic Tally/SAP Table) ── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-bold text-foreground">
                                Transaction Entries (Dr / Cr)
                            </Label>
                            <span className="text-xs text-muted-foreground font-medium">
                                Strict double-entry balancing required
                            </span>
                        </div>
                        <VoucherLinesGrid
                            lines={lines}
                            onChange={setLines}
                            voucherType={voucherType}
                        />
                    </div>

                    {/* ── Bill-by-Bill Allocation (if receipt/payment has outstanding bills for party) ── */}
                    {(voucherType === 'receipt' || voucherType === 'payment') && partyLedger && pendingBills.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="border rounded-lg overflow-hidden shadow-sm">
                                <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-muted/60 border-b gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-foreground">
                                            {loadingBills ? 'Loading bills...' : `Outstanding Bills for ${partyLedger.name} (${visibleBills.length})`}
                                        </span>
                                        {targetAdjustAmount > 0 && (
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <span className="px-2 py-0.5 rounded bg-muted font-medium text-muted-foreground border">
                                                    Target: {fmt(targetAdjustAmount)}
                                                </span>
                                                {isFullyAdjusted ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Fully Adjusted (Remaining: {fmt(0)})
                                                    </span>
                                                ) : isOverAllocated ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300">
                                                        Over-allocated by {fmt(billTotal - targetAdjustAmount)}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                                        Remaining to Adjust: {fmt(remainingToAdjust)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {visibleBills.length > 0 && !loadingBills && (
                                        <div className="flex items-center gap-2">
                                            {targetAdjustAmount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={autoAllocate}
                                                    className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 rounded font-medium transition-colors border border-primary/20"
                                                >
                                                    Auto-Adjust ({fmt(targetAdjustAmount)})
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={selectAll}
                                                className="text-xs text-primary hover:underline font-medium"
                                            >
                                                Pay All
                                            </button>
                                            <span className="text-muted-foreground text-xs">·</span>
                                            <button
                                                type="button"
                                                onClick={clearAll}
                                                className="text-xs text-muted-foreground hover:underline"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {loadingBills ? (
                                    <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Loading bills...
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/30">
                                            <tr>
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-8"></th>
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Bill No</th>
                                                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                                                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Bill Amt</th>
                                                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Pending</th>
                                                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Pay Now (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {visibleBills.map((bill) => {
                                                const payAmt = parseFloat(billAmounts[bill.id]) || 0;
                                                const isSelected = payAmt > 0;
                                                const isFull = Math.abs(payAmt - bill.outstanding) < 0.01;
                                                return (
                                                    <tr
                                                        key={bill.id}
                                                        className={cn(
                                                            'hover:bg-muted/20 transition-colors',
                                                            isSelected && 'bg-primary/5'
                                                        )}
                                                    >
                                                        <td className="px-4 py-2.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleBillSmart(bill.id, bill.outstanding)}
                                                                className={cn(
                                                                    'text-primary transition-colors',
                                                                    !isSelected && 'text-muted-foreground'
                                                                )}
                                                                title={isSelected ? "Click to clear this bill" : "Click to auto-adjust against remaining amount"}
                                                            >
                                                                {isFull ? (
                                                                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                                                                ) : isSelected ? (
                                                                    <MinusSquare className="w-4 h-4 text-primary" />
                                                                ) : (
                                                                    <Square className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        </td>
                                                        <td className="px-4 py-2.5 font-medium">{bill.invoiceNo}</td>
                                                        <td className="px-4 py-2.5 text-muted-foreground">
                                                            {format(new Date(bill.date), 'dd-MM-yy')}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                                                            {fmt(bill.grandTotal)}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-medium text-orange-600">
                                                            {fmt(bill.outstanding)}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max={bill.outstanding}
                                                                step="0.01"
                                                                placeholder="0.00"
                                                                className={cn(
                                                                    'text-right w-28 ml-auto h-8 text-sm',
                                                                    isSelected && (isFull ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-primary ring-1 ring-primary/30')
                                                                )}
                                                                value={billAmounts[bill.id] ?? ''}
                                                                onChange={(e) =>
                                                                    setBillAmounts(prev => ({ ...prev, [bill.id]: e.target.value }))
                                                                }
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-muted/30 border-t-2">
                                            <tr>
                                                <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-right text-muted-foreground">
                                                    {targetAdjustAmount > 0 ? (
                                                        <div className="flex justify-end items-center gap-3 text-xs">
                                                            <span>Voucher Target: <strong className="text-foreground">{fmt(targetAdjustAmount)}</strong></span>
                                                            <span>·</span>
                                                            <span>Remaining: <strong className={remainingToAdjust > 0 ? "text-amber-700 font-bold" : "text-emerald-600 font-bold"}>{fmt(remainingToAdjust)}</strong></span>
                                                            <span>·</span>
                                                            <span className="text-foreground font-semibold">Allocated Total:</span>
                                                        </div>
                                                    ) : (
                                                        "Allocated Bills Total:"
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold text-orange-600">
                                                    {fmt(visibleBills.reduce((s, b) => s + b.outstanding, 0))}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold text-primary">
                                                    {fmt(billTotal)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Narration */}
                    <div className="space-y-1.5">
                        <Label>Narration <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Textarea
                            rows={2}
                            placeholder="Add transaction remarks or voucher note..."
                            value={narration}
                            onChange={(e) => setNarration(e.target.value)}
                        />
                    </div>

                    {/* Revision Reason Section for Posted Vouchers */}
                    {voucherId && originalStatus === 'posted' && (
                        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-4">
                            <div className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
                                <AlertCircle className="w-5 h-5" />
                                Modification Reason Required
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Reason Code</Label>
                                    <select 
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={reasonCode}
                                        onChange={(e) => setReasonCode(e.target.value)}
                                    >
                                        <option value="" disabled>Select a reason...</option>
                                        {REASON_CODES.map(rc => (
                                            <option key={rc.value} value={rc.value}>{rc.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Detailed Explanation</Label>
                                    <Textarea 
                                        placeholder="Explain why this transaction is being modified..."
                                        value={reasonText}
                                        onChange={e => setReasonText(e.target.value)}
                                        className="min-h-[40px]"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── RIGHT COLUMN (Summary & Actions Rail) ── */}
            <div className="lg:col-span-4 xl:col-span-3">
                <div className="sticky top-6 space-y-4">
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
                            <h3 className="font-semibold text-sm tracking-tight">Voucher Summary</h3>
                            <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                                isBalanced 
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300" 
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                            )}>
                                {isBalanced ? "Balanced" : "Imbalanced"}
                            </span>
                        </div>
                        <div className="p-4 space-y-4 flex-1">
                            {/* Live Balances Breakdown */}
                            <div className="space-y-3 bg-muted/20 border rounded-lg p-3 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="font-medium text-muted-foreground">Total Debits (Dr):</span>
                                    <span className="font-bold font-mono text-blue-600 dark:text-blue-400 text-sm">
                                        ₹{totalDebits.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="font-medium text-muted-foreground">Total Credits (Cr):</span>
                                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                                        ₹{totalCredits.toFixed(2)}
                                    </span>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center pt-0.5">
                                    <span className="font-semibold text-foreground text-xs">Difference:</span>
                                    <span className={cn(
                                        "font-bold font-mono text-base",
                                        isBalanced ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400 font-extrabold"
                                    )}>
                                        ₹{Math.abs(diff).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Balance Status Banner */}
                            {isBalanced ? (
                                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900">
                                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                                    <span>Voucher is perfectly balanced. Ready to save.</span>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-lg border border-amber-200 dark:border-amber-900">
                                    <Lock className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Save Locked: Dr and Cr must balance.</p>
                                        <p className="font-normal text-[11px] text-amber-600/90 mt-0.5">
                                            {diff > 0 ? `Needs ₹${diff.toFixed(2)} more in Credit` : `Needs ₹${Math.abs(diff).toFixed(2)} more in Debit`}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="pt-2 space-y-3">
                                <Button 
                                    onClick={() => handleSave()} 
                                    disabled={!canSave} 
                                    className={cn(
                                        "w-full flex justify-between items-center h-12 rounded-lg transition-all",
                                        !canSave && "opacity-60 cursor-not-allowed"
                                    )}
                                >
                                    <div className="flex items-center text-sm">
                                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <span className="font-semibold">Save Voucher</span>
                                    </div>
                                    <span className="text-[10px] uppercase bg-primary-foreground/20 px-1.5 py-0.5 rounded font-bold">Ctrl+S</span>
                                </Button>
                                
                                <Button 
                                    variant="ghost" 
                                    onClick={handleClear} 
                                    disabled={saving} 
                                    className="w-full flex justify-between items-center h-10 rounded-lg text-muted-foreground"
                                >
                                    <span className="font-medium text-sm">Clear Form</span>
                                    <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded font-bold">Esc</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
