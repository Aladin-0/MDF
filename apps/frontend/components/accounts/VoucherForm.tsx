'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2, Plus, Trash2, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi } from '@/lib/apiClient';
import { Ledger, Voucher, PendingBill } from '@/types';
import { LedgerPicker } from './LedgerPicker';
import { cn } from '@/lib/utils';

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

function newLine(): LineRow {
    return { id: Math.random().toString(36).slice(2), ledger: null, debit: '', credit: '', description: '' };
}

function fmt(n: number) {
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VoucherForm({ initialType = 'receipt', onSuccess }: VoucherFormProps) {
    const outletId = useOutletId();
    const { toast } = useToast();

    const [voucherType, setVoucherType] = useState<VoucherType>(initialType);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [voucherNo, setVoucherNo] = useState('');
    const [narration, setNarration] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadingNo, setLoadingNo] = useState(false);

    // Party + cash/bank
    const [partyLedger, setPartyLedger] = useState<Ledger | null>(null);
    const [cashBankLedger, setCashBankLedger] = useState<Ledger | null>(null);

    // Bill-by-bill state
    const [pendingBills, setPendingBills] = useState<PendingBill[]>([]);
    const [billAmounts, setBillAmounts] = useState<Record<string, string>>({});
    const [onAccountAmount, setOnAccountAmount] = useState('');
    const [loadingBills, setLoadingBills] = useState(false);

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
        if (!outletId) return;
        setLoadingNo(true);
        voucherApi.getNextVoucherNo(outletId, voucherType)
            .then((d: any) => setVoucherNo(d.voucherNo || ''))
            .catch(() => {})
            .finally(() => setLoadingNo(false));
    }, [outletId, voucherType]);

    // Load pending bills when party ledger changes
    useEffect(() => {
        if (!partyLedger || !outletId) {
            setPendingBills([]);
            setBillAmounts({});
            return;
        }
        setLoadingBills(true);
        voucherApi.getPendingBills(outletId, partyLedger.id)
            .then((data: PendingBill[]) => {
                setPendingBills(data);
                // Init with 0 for each bill
                const init: Record<string, string> = {};
                data.forEach(b => { init[b.id] = ''; });
                setBillAmounts(init);
            })
            .catch(() => setPendingBills([]))
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
            if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') handleClear();
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
            let payload: any = { outletId, voucher_type: voucherType, date, narration };

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

                payload.total_amount = totalAmount;
                payload.payment_mode = cashBankLedger.groupName === 'Bank Accounts' ? 'bank' : 'cash';

                if (voucherType === 'payment') {
                    payload.lines = [
                        { ledger_id: partyLedger.id, debit: totalAmount, credit: 0, description: '' },
                        { ledger_id: cashBankLedger.id, debit: 0, credit: totalAmount, description: '' },
                    ];
                } else {
                    payload.lines = [
                        { ledger_id: cashBankLedger.id, debit: totalAmount, credit: 0, description: '' },
                        { ledger_id: partyLedger.id, debit: 0, credit: totalAmount, description: '' },
                    ];
                }

                payload.bill_adjustments = pendingBills
                    .filter(b => (parseFloat(billAmounts[b.id]) || 0) > 0)
                    .map(b => ({
                        invoice_id: b.id,
                        invoice_type: b.invoiceType,
                        adjusted_amount: parseFloat(billAmounts[b.id]) || 0,
                    }));

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
                payload.total_amount = amt;
                payload.payment_mode = 'cash';
                payload.lines = [
                    { ledger_id: contraDebitLedger.id, debit: amt, credit: 0, description: '' },
                    { ledger_id: contraCreditLedger.id, debit: 0, credit: amt, description: '' },
                ];
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
                payload.total_amount = td;
                payload.payment_mode = 'cash';
                payload.lines = validLines.map(l => ({
                    ledger_id: l.ledger!.id,
                    debit: parseFloat(l.debit) || 0,
                    credit: parseFloat(l.credit) || 0,
                    description: l.description,
                }));
            }

            const voucher = await voucherApi.createVoucher(payload);
            toast({ title: `${TYPE_LABELS[voucherType]} saved`, description: voucher.voucherNo });
            handleClear();
            voucherApi.getNextVoucherNo(outletId, voucherType).then((d: any) => setVoucherNo(d.voucherNo || ''));
            onSuccess?.(voucher);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err?.detail || String(err) });
        } finally {
            setSaving(false);
        }
    }

    const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);

    return (
        <div className="space-y-6">
            {/* Voucher Type */}
            <div className="grid grid-cols-4 gap-2">
                {(['receipt', 'payment', 'contra', 'journal'] as VoucherType[]).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { setVoucherType(t); handleClear(); }}
                        className={cn(
                            'rounded-lg border-2 py-3 text-sm font-medium transition-all',
                            voucherType === t
                                ? 'border-primary bg-primary text-white'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                        )}
                    >
                        <div>{TYPE_LABELS[t]}</div>
                        <div className="text-xs opacity-60 mt-0.5">
                            {t === 'receipt' ? 'F6' : t === 'payment' ? 'F5' : t === 'contra' ? 'F4' : 'F7'}
                        </div>
                    </button>
                ))}
            </div>

            {/* Date + Voucher No */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label>Voucher No</Label>
                    <Input value={loadingNo ? 'Loading...' : voucherNo} readOnly className="bg-muted" />
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
                                    {loadingBills ? 'Loading bills...' : `Outstanding Bills (${pendingBills.length})`}
                                </span>
                                {pendingBills.length > 0 && !loadingBills && (
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
                            ) : pendingBills.length === 0 ? (
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
                                        {pendingBills.map((bill) => {
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
                                                {fmt(pendingBills.reduce((s, b) => s + b.outstanding, 0))}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-bold text-primary">
                                                {fmt(billTotal)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
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

                    {/* Total Amount Display */}
                    {partyLedger && (
                        <div className="flex items-center justify-between rounded-lg bg-primary/5 border-2 border-primary/20 px-5 py-3">
                            <span className="font-semibold text-foreground">Total Amount</span>
                            <span className="text-2xl font-black text-primary">{fmt(totalAmount)}</span>
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
                    <div className="grid grid-cols-[1fr_110px_110px_auto] gap-2 pt-2 border-t text-sm font-semibold">
                        <span className="text-right text-muted-foreground">Total</span>
                        <span className={cn('text-right', totalDebit !== totalCredit && 'text-destructive')}>₹{totalDebit.toFixed(2)}</span>
                        <span className={cn('text-right', totalDebit !== totalCredit && 'text-destructive')}>₹{totalCredit.toFixed(2)}</span>
                        <span />
                    </div>
                    {totalDebit !== totalCredit && totalDebit > 0 && (
                        <p className="text-xs text-destructive">Journal entries must balance (Debit = Credit)</p>
                    )}
                </div>
            )}

            {/* Narration */}
            <div className="space-y-1.5">
                <Label>Narration <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea rows={2} placeholder="Add a note..." value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save <span className="ml-1.5 text-xs opacity-70">Ctrl+S</span>
                </Button>
                {(voucherType === 'receipt' || voucherType === 'payment') && (
                    <Button variant="outline" disabled={saving} onClick={async () => { await handleSave(); }}>
                        Save &amp; Print <span className="ml-1.5 text-xs opacity-70">Ctrl+P</span>
                    </Button>
                )}
                <Button variant="outline" onClick={handleClear} disabled={saving}>
                    Clear <span className="ml-1.5 text-xs opacity-70">Esc</span>
                </Button>
            </div>
        </div>
    );
}
