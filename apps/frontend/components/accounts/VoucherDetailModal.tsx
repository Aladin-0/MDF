import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { FileText, History, RefreshCw, Receipt, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { voucherApi } from '@/lib/apiClient';

const INR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

export function VoucherDetailModal({
    open,
    onOpenChange,
    voucherId,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    voucherId: string;
}) {
    const [data, setData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (!open || !voucherId) return;
        setLoading(true);
        voucherApi.getVoucherById(voucherId)
            .then(setData)
            .catch(() => {
                toast({ variant: 'destructive', title: 'Could not load voucher details' });
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [open, voucherId]);

    const typeLabels: Record<string, string> = { receipt: 'Receipt', payment: 'Payment', contra: 'Contra', journal: 'Journal' };
    const typeColors: Record<string, string> = {
        receipt: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        payment: 'bg-blue-100 text-blue-700 border-blue-200',
        contra: 'bg-amber-100 text-amber-700 border-amber-200',
        journal: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    const modeLabel: Record<string, string> = { cash: 'Cash', bank: 'Bank', cheque: 'Cheque' };
    const billAdj: any[] = data?.billAdjustments ?? [];
    const billTotal = billAdj.reduce((s: number, b: any) => s + b.adjustedAmount, 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between text-base">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-500" />
                            Voucher Details
                        </div>
                        {data && (
                            <div className="flex items-center gap-2 mr-6">
                                <Button variant="outline" size="sm" asChild className="h-8 shadow-sm">
                                    <Link href={`/dashboard/accounts/voucher-entry/revisions/${data.id}`}>
                                        <History className="h-3.5 w-3.5 mr-1.5" />
                                        History
                                    </Link>
                                </Button>
                                <Button variant="default" size="sm" asChild className="h-8 shadow-sm bg-indigo-600 hover:bg-indigo-700">
                                    <Link href={`/dashboard/accounts/voucher-entry?editId=${data.id}`}>
                                        Edit
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : !data ? (
                    <p className="py-8 text-center text-sm text-slate-400">No data found.</p>
                ) : (
                    <div className="space-y-5 text-sm">

                        {/* Header strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 border p-4">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Voucher No</p>
                                <p className="font-mono font-bold text-slate-800">{data.voucherNo}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Type</p>
                                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${typeColors[data.voucherType] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {typeLabels[data.voucherType] ?? data.voucherType}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Date</p>
                                <p className="font-semibold text-slate-800">{format(new Date(data.date), 'dd MMM yyyy')}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Mode</p>
                                <p className="font-semibold text-slate-800">{modeLabel[data.paymentMode] ?? data.paymentMode ?? '—'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Total Amount</p>
                                <p className="text-xl font-black text-indigo-600">{INR(data.totalAmount)}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Created At</p>
                                <p className="text-slate-500 text-xs">{format(new Date(data.createdAt), 'dd MMM yyyy, hh:mm a')}</p>
                            </div>
                            {data.narration && (
                                <div className="col-span-4 border-t pt-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Narration</p>
                                    <p className="text-slate-700 italic">&ldquo;{data.narration}&rdquo;</p>
                                </div>
                            )}
                        </div>

                        {/* Bill-by-Bill Breakdown */}
                        {billAdj.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                    <Receipt className="h-3.5 w-3.5" />
                                    Bill-by-Bill Payment Breakdown
                                </p>
                                <div className="overflow-hidden rounded-xl border">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 border-b">
                                            <tr>
                                                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Bill No</th>
                                                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Bill Date</th>
                                                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Bill Amt</th>
                                                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Paid (This)</th>
                                                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Still Pending</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {billAdj.map((b: any, i: number) => (
                                                <tr key={i} className="hover:bg-slate-50/60">
                                                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">{b.invoiceNo}</td>
                                                    <td className="px-4 py-3 text-slate-500">
                                                        {b.invoiceDate ? format(new Date(b.invoiceDate), 'dd MMM yyyy') : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-700">{INR(b.grandTotal)}</td>
                                                    <td className="px-4 py-3 text-right font-semibold text-blue-600">{INR(b.adjustedAmount)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        {b.currentOutstanding > 0
                                                            ? <span className="font-semibold text-orange-600">{INR(b.currentOutstanding)}</span>
                                                            : <span className="font-semibold text-emerald-600">✓ Cleared</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t-2 bg-slate-50">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-slate-500 text-xs">Bills Total Paid:</td>
                                                <td className="px-4 py-2.5 text-right font-bold text-blue-600">{INR(billTotal)}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                {data.totalAmount > billTotal + 0.01 && (
                                    <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-4 py-2.5">
                                        <span className="text-xs text-amber-700 font-medium">On Account (advance / not linked to a bill)</span>
                                        <span className="font-bold text-amber-700">{INR(data.totalAmount - billTotal)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Ledger Entries */}
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <CreditCard className="h-3.5 w-3.5" />
                                Ledger Entries
                            </p>
                            <div className="overflow-hidden rounded-xl border">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Ledger</th>
                                            <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Dr</th>
                                            <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Cr</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {data.lines?.map((line: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-3 font-medium text-slate-700">
                                                    {line.ledgerName}
                                                    {line.description && <span className="block text-slate-400 font-normal">{line.description}</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                    {line.debit > 0 ? <span className="font-semibold text-red-600">{INR(line.debit)}</span> : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                    {line.credit > 0 ? <span className="font-semibold text-emerald-600">{INR(line.credit)}</span> : <span className="text-slate-300">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
