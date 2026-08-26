'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, Plus, Trash2, CheckSquare, Square, MinusSquare, AlertCircle, XCircle } from 'lucide-react';
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
import { LedgerPicker } from './LedgerPicker';
import { cn } from '@/lib/utils';
import { DISABLE_DISRUPTIVE_SHORTCUTS, isEditableElement } from '@/lib/shortcuts';
import { buildVoucherPayload } from '@/utils/payloadBuilders';

type VoucherType = 'receipt' | 'payment' | 'contra' | 'journal';

interface LineRow {
    id: string;
    ledger: Ledger | null;
    debit: string;
    credit: string;
    description: string;
}

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

function newLine(): LineRow {
    return { id: Math.random().toString(36).slice(2), ledger: null, debit: '', credit: '', description: '' };
}

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
    
    // Revision tracking
    const [reasonCode, setReasonCode] = useState('');
    const [reasonText, setReasonText] = useState('');

    // Party + cash/bank
    const [partyLedger, setPartyLedger] = useState<Ledger | null>(null);
    const [cashBankLedger, setCashBankLedger] = useState<Ledger | null>(null);

    // Bill-by-bill state
    const [pendingBills, setPendingBills] = useState<PendingBill[]>([]);
    const [billAmounts, setBillAmounts] = useState<Record<string, string>>({});
    const [onAccountAmount, setOnAccountAmount] = useState('');
    const [loadingBills, setLoadingBills] = useState(false);
    const [showAllBills, setShowAllBills] = useState(false);

    // Contra
    const [contraDebitLedger, setContraDebitLedger] = useState<Ledger | null>(null);
    const [contraCreditLedger, setContraCreditLedger] = useState<Ledger | null>(null);
    const [contraAmount, setContraAmount] = useState('');

    // Journal
    const [lines, setLines] = useState<LineRow[]>([newLine(), newLine()]);

    // Computed totals
    const billTotal = Object.values(billAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const onAcc = parseFloat(onAccountAmount) || 0;
    const totalAmount = billTotal + onAcc;

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

                if (data.voucherType === 'receipt' || data.voucherType === 'payment') {
                    const cb = data.lines.find((l: any) => ['Cash in Hand', 'Bank Accounts'].includes(l.ledger?.groupName));
                    const pt = data.lines.find((l: any) => l.ledger?.id !== cb?.ledger?.id);
                    if (cb) setCashBankLedger(cb.ledger);
                    if (pt) setPartyLedger(pt.ledger);

                    let billTot = 0;
                    const initialBills: Record<string, string> = {};
                    data.billAdjustments?.forEach((adj: any) => {
                        const id = adj.invoiceId || adj.saleInvoice || adj.purchaseInvoice;
                        if (id) {
                            initialBills[id] = adj.adjustedAmount;
                            billTot += parseFloat(adj.adjustedAmount) || 0;
                        }
                    });
                    setBillAmounts(initialBills);
                    const rem = parseFloat(data.totalAmount) - billTot;
                    if (rem > 0) setOnAccountAmount(rem.toFixed(2));
                } else if (data.voucherType === 'contra') {
                    const dr = data.lines.find((l: any) => l.debit > 0);
                    const cr = data.lines.find((l: any) => l.credit > 0);
                    if (dr) setContraDebitLedger(dr.ledger);
                    if (cr) setContraCreditLedger(cr.ledger);
                    setContraAmount(data.totalAmount);
                } else if (data.voucherType === 'journal') {
                    setLines(data.lines.map((l: any) => ({
                        id: Math.random().toString(36).slice(2),
                        ledger: l.ledger,
                        debit: l.debit > 0 ? l.debit.toString() : '',
                        credit: l.credit > 0 ? l.credit.toString() : '',
                        description: l.description || ''
                    })));
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
        if (!partyLedger || !outletId) {
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
                    // Initialize new pending bills with empty strings
                    data.forEach(b => { next[b.id] = ''; });
                    // Preserve any existing amounts (from hydration or user input)
                    Object.keys(prev).forEach(k => {
                        if (prev[k]) {
                            next[k] = prev[k];
                        }
                    });
                    return next;
                });
            })
            .catch(() => {
                setGlobalError('Failed to fetch outstanding bills. Please try again.');
                setPendingBills([]);
            })
            .finally(() => setLoadingBills(false));
    }, [partyLedger, outletId]);

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
                if (isEditableElement(e.target)) return;
                e.preventDefault(); 
                handleSave(); 
            }
            if (e.key === 'Escape') {
                if (DISABLE_DISRUPTIVE_SHORTCUTS) return;
                handleClear();
            }
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    });

    function handleClear() {
        setPartyLedger(null);
        setCashBankLedger(null);
        setPendingBills([]);
        setBillAmounts({});
        setOnAccountAmount('');
        setContraDebitLedger(null);
        setContraCreditLedger(null);
        setContraAmount('');
        setLines([newLine(), newLine()]);
        setNarration('');
    }

    function toggleBillFull(billId: string, outstanding: number) {
        const cur = parseFloat(billAmounts[billId]) || 0;
        const isFull = Math.abs(cur - outstanding) < 0.01;
        setBillAmounts(prev => ({ ...prev, [billId]: isFull ? '' : outstanding.toFixed(2) }));
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

        setSaving(true);
        try {
            if (voucherId && originalStatus === 'posted') {
                if (!reasonCode || reasonText.length < 10) {
                    toast({ variant: 'destructive', title: 'Revision Reason Required', description: 'Please provide a valid reason code and explanation (min 10 chars) for this modification.' });
                    return;
                }
            }

            if (voucherType === 'receipt' || voucherType === 'payment') {
                if (!partyLedger || !cashBankLedger) {
                    toast({ variant: 'destructive', title: 'Select both ledgers' });
                    setSaving(false);
                    return;
                }
                if (totalAmount <= 0) {
                    toast({ variant: 'destructive', title: 'Enter at least one bill amount or on-account amount' });
                    setSaving(false);
                    return;
                }
            } else if (voucherType === 'contra') {
                if (!contraDebitLedger || !contraCreditLedger) {
                    toast({ variant: 'destructive', title: 'Select both ledgers' });
                    setSaving(false);
                    return;
                }
                if (contraDebitLedger.id === contraCreditLedger.id) {
                    toast({ variant: 'destructive', title: 'Dr and Cr ledgers must be different' });
                    setSaving(false);
                    return;
                }
                const amt = parseFloat(contraAmount);
                if (!amt || amt <= 0) {
                    toast({ variant: 'destructive', title: 'Enter an amount' });
                    setSaving(false);
                    return;
                }
            } else {
                const validLines = lines.filter(l => l.ledger);
                if (validLines.length < 2) {
                    toast({ variant: 'destructive', title: 'Add at least two journal lines' });
                    setSaving(false);
                    return;
                }
                const td = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
                const tc = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
                if (td !== tc) {
                    toast({ variant: 'destructive', title: 'Journal must balance (Dr = Cr)' });
                    setSaving(false);
                    return;
                }
            }

            const payload = buildVoucherPayload(
                voucherType,
                date,
                narration,
                outletId,
                partyLedger,
                cashBankLedger,
                totalAmount,
                pendingBills,
                billAmounts,
                contraDebitLedger,
                contraCreditLedger,
                contraAmount ? parseFloat(contraAmount) : 0,
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
            toast({ title: `${TYPE_LABELS[voucherType]} ${voucherId ? 'updated' : 'saved'}`, description: voucher.voucherNo });
            if (!voucherId) {
                handleClear();
                voucherApi.getNextVoucherNo(outletId, voucherType).then((d: any) => setVoucherNo(d.voucherNo || ''));
            }
            onSuccess?.(voucher);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err?.detail || String(err) });
        } finally {
            setSaving(false);
        }
    }

    const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);

    if (loadingVoucher) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">Loading voucher...</div>;
    }

    const visibleBills = (voucherId && !showAllBills) 
        ? pendingBills.filter(b => parseFloat(billAmounts[b.id]) > 0)
        : pendingBills;

    if (globalError) {
        return (
            <div className="p-8 text-center bg-red-50 text-red-600 rounded-lg border border-red-200">
                <AlertCircle className="w-8 h-8 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Error Loading Data</h3>
                <p>{globalError}</p>
                <Button variant="outline" className="mt-4 border-red-200 text-red-600 hover:bg-red-100" onClick={() => window.location.reload()}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN (Main Form) ── */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {/* Voucher Type Segmented Control */}
            <div className="flex p-1 bg-muted/50 rounded-lg border">
                {(['receipt', 'payment', 'contra', 'journal'] as VoucherType[]).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { setVoucherType(t); handleClear(); }}
                        className={cn(
                            'flex-1 flex flex-col items-center justify-center py-2 px-2 rounded-md text-sm font-medium transition-all',
                            voucherType === t
                                ? 'bg-background text-foreground shadow-sm border border-border/50'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}
                    >
                        <span>{TYPE_LABELS[t]}</span>
                        <span className="text-[10px] uppercase font-semibold mt-0.5 opacity-60">
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
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 shadow-none border-slate-200 focus-visible:ring-primary/20 transition-all" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-slate-500 font-medium">Voucher No</Label>
                        <Input value={loadingNo ? 'Loading...' : voucherNo} readOnly className="h-11 bg-slate-50 border-slate-100 text-slate-600 font-medium shadow-none cursor-not-allowed" />
                    </div>
                </div>

            {/* ── Receipt / Payment (Bill-by-Bill) ── */}
            {(voucherType === 'receipt' || voucherType === 'payment') && (
                <div className="space-y-4">
                    {/* Party Ledger */}
                    <div className="space-y-1.5">
                        <Label>
                            {voucherType === 'payment' ? 'Dr. Ledger' : 'Cr. Ledger'}
                            <span className="text-muted-foreground text-xs ml-1">
                                ({voucherType === 'payment' ? 'Paid To' : 'Received From'})
                            </span>
                        </Label>
                        <LedgerPicker
                            voucherType={voucherType}
                            filterGroup="party"
                            value={partyLedger}
                            onChange={(l) => { setPartyLedger(l); }}
                            placeholder={voucherType === 'payment' ? 'Search supplier / expense ledger...' : 'Search customer / income ledger...'}
                        />
                    </div>

                    {/* Bill-by-Bill Table */}
                    {partyLedger && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/60 border-b">
                                <span className="text-sm font-semibold text-foreground">
                                    {loadingBills ? 'Loading bills...' : `Outstanding Bills (${visibleBills.length})`}
                                </span>
                                {visibleBills.length > 0 && !loadingBills && (
                                    <div className="flex gap-2">
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
                                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Loading pending bills...
                                </div>
                            ) : visibleBills.length === 0 ? (
                                <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                    No outstanding bills. Amount will be recorded On Account.
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
                                                            onClick={() => toggleBillFull(bill.id, bill.outstanding)}
                                                            className={cn(
                                                                'text-primary transition-colors',
                                                                !isSelected && 'text-muted-foreground'
                                                            )}
                                                        >
                                                            {isFull
                                                                ? <CheckSquare className="w-4 h-4" />
                                                                : isSelected 
                                                                    ? <MinusSquare className="w-4 h-4" />
                                                                    : <Square className="w-4 h-4" />
                                                            }
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
                                                                isSelected && 'border-primary ring-1 ring-primary/30'
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
                                    {/* Summary row */}
                                    <tfoot className="bg-muted/30 border-t-2">
                                        <tr>
                                            <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-right text-muted-foreground">
                                                Bills Total:
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
                            
                            {voucherId && !loadingBills && pendingBills.length > visibleBills.length && (
                                <div className="bg-muted/10 border-t p-2 flex justify-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-muted-foreground"
                                        onClick={() => setShowAllBills(true)}
                                    >
                                        Show all {pendingBills.length} outstanding bills
                                    </Button>
                                </div>
                            )}
                            
                            {voucherId && !loadingBills && showAllBills && pendingBills.length > visibleBills.filter(b => parseFloat(billAmounts[b.id]) > 0).length && (
                                <div className="bg-muted/10 border-t p-2 flex justify-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-muted-foreground"
                                        onClick={() => setShowAllBills(false)}
                                    >
                                        Hide unselected bills
                                    </Button>
                                </div>
                            )}


                            {/* On Account extra */}
                            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="font-medium">On Account</span>
                                    <span className="text-xs">(advance / extra amount not against any bill)</span>
                                </div>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="text-right w-28 h-8 text-sm"
                                    value={onAccountAmount}
                                    onChange={(e) => setOnAccountAmount(e.target.value)}
                                />
                            </div>
                        </div>
                    )}


                    {/* Cash/Bank Ledger */}
                    <div className="space-y-1.5">
                        <Label>
                            {voucherType === 'payment' ? 'Cr. Ledger' : 'Dr. Ledger'}
                            <span className="text-muted-foreground text-xs ml-1">
                                ({voucherType === 'payment' ? 'Paid From' : 'Received In'})
                            </span>
                        </Label>
                        <LedgerPicker
                            voucherType={voucherType}
                            filterGroup="cashbank"
                            value={cashBankLedger}
                            onChange={setCashBankLedger}
                            placeholder="Search cash / bank ledger..."
                        />
                    </div>
                </div>
            )}

            {/* ── Contra Form ── */}
            {voucherType === 'contra' && (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Dr. Ledger <span className="text-muted-foreground text-xs">(Money Going TO)</span></Label>
                        <LedgerPicker voucherType="contra" filterGroup="cashbank" value={contraDebitLedger} onChange={setContraDebitLedger} placeholder="Search cash / bank ledger..." />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Amount</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                            <Input type="number" min="0" step="0.01" className="pl-7" placeholder="0.00" value={contraAmount} onChange={(e) => setContraAmount(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Cr. Ledger <span className="text-muted-foreground text-xs">(Money Coming FROM)</span></Label>
                        <LedgerPicker voucherType="contra" filterGroup="cashbank" value={contraCreditLedger} onChange={setContraCreditLedger} placeholder="Search cash / bank ledger..." />
                    </div>
                </div>
            )}

            {/* ── Journal Form ── */}
            {voucherType === 'journal' && (
                <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_110px_110px_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                        <span>Ledger</span>
                        <span className="text-right">Dr (₹)</span>
                        <span className="text-right">Cr (₹)</span>
                        <span />
                    </div>
                    {lines.map((line) => (
                        <div key={line.id} className="grid grid-cols-[1fr_110px_110px_auto] gap-2 items-center">
                            <LedgerPicker value={line.ledger} onChange={(l) => setLines(prev => prev.map(x => x.id === line.id ? { ...x, ledger: l } : x))} />
                            <Input type="number" min="0" step="0.01" placeholder="0.00" className="text-right" value={line.debit} onChange={(e) => setLines(prev => prev.map(x => x.id === line.id ? { ...x, debit: e.target.value } : x))} />
                            <Input type="number" min="0" step="0.01" placeholder="0.00" className="text-right" value={line.credit} onChange={(e) => setLines(prev => prev.map(x => x.id === line.id ? { ...x, credit: e.target.value } : x))} />
                            <button type="button" onClick={() => setLines(prev => prev.filter(x => x.id !== line.id))} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={() => setLines(prev => [...prev, newLine()])} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <Plus className="w-3.5 h-3.5" /> Add line
                    </button>
                </div>
            )}

            {/* Narration */}
            <div className="space-y-1.5">
                <Label>Narration <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea rows={2} placeholder="Add a note..." value={narration} onChange={(e) => setNarration(e.target.value)} />
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
                        <div className="p-4 border-b bg-muted/40">
                            <h3 className="font-semibold text-base tracking-tight">Voucher Summary</h3>
                        </div>
                        <div className="p-5 space-y-6 flex-1">
                            {/* Summary Content based on Type */}
                            {(voucherType === 'receipt' || voucherType === 'payment') && partyLedger && (
                                <div className="space-y-1 bg-muted/30 p-4 rounded-lg border">
                                    <div className="text-sm font-medium text-muted-foreground">Total Amount</div>
                                    <div className="text-3xl font-bold text-foreground tracking-tight">{fmt(totalAmount)}</div>
                                </div>
                            )}
                            
                            {voucherType === 'contra' && contraAmount && (
                                <div className="space-y-1 bg-muted/30 p-4 rounded-lg border">
                                    <div className="text-sm font-medium text-muted-foreground">Contra Amount</div>
                                    <div className="text-3xl font-bold text-foreground tracking-tight">{fmt(parseFloat(contraAmount) || 0)}</div>
                                </div>
                            )}

                            {voucherType === 'journal' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground font-medium">Total Debit</span>
                                        <span className="font-semibold text-base">₹{totalDebit.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground font-medium">Total Credit</span>
                                        <span className="font-semibold text-base">₹{totalCredit.toFixed(2)}</span>
                                    </div>
                                    <Separator />
                                    {totalDebit !== totalCredit && totalDebit > 0 ? (
                                        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            <p className="font-medium">Journal entries must balance (Debit = Credit)</p>
                                        </div>
                                    ) : (totalDebit > 0 && totalDebit === totalCredit) ? (
                                        <div className="flex items-start gap-2.5 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                                            <CheckSquare className="w-4 h-4 mt-0.5 shrink-0" />
                                            <p className="font-medium">Journal is balanced.</p>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="pt-2 space-y-3">
                                <Button 
                                    onClick={() => handleSave()} 
                                    disabled={saving} 
                                    className="w-full flex justify-between items-center h-12 rounded-lg"
                                >
                                    <div className="flex items-center text-sm">
                                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <span className="font-semibold">Save Voucher</span>
                                    </div>
                                    <span className="text-[10px] uppercase bg-primary-foreground/20 px-1.5 py-0.5 rounded font-bold">Ctrl+S</span>
                                </Button>
                                
                                {(voucherType === 'receipt' || voucherType === 'payment') && (
                                    <Button 
                                        variant="outline" 
                                        disabled={saving} 
                                        onClick={async () => { await handleSave(); }} 
                                        className="w-full flex justify-between items-center h-10 rounded-lg"
                                    >
                                        <span className="font-medium text-sm">Save &amp; Print</span>
                                        <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded font-bold text-muted-foreground">Ctrl+P</span>
                                    </Button>
                                )}
                                
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
