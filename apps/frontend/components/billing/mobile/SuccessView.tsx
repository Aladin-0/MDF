'use client';

import { format } from 'date-fns';
import { CheckCircle2, FileText, MessageCircle, Plus, Printer, Share2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatINR } from './collectState';
import { T } from './theme';

interface SuccessViewProps {
    invoice: any;
    onNewBill: () => void;
    onPrint: () => void;
    onViewInvoice: () => void;
}

const btn = 'flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2 px-4 text-base';

/** Phone "Bill saved" screen (design 3.6): the result at a glance, then Print / Share / WhatsApp / New bill / View invoice. */
export function SuccessView({ invoice, onNewBill, onPrint, onViewInvoice }: SuccessViewProps) {
    const { user } = useAuthStore();
    const { toast } = useToast();

    const amount = Number(invoice?.grandTotal) || 0;
    const created = invoice?.createdAt && !isNaN(new Date(invoice.createdAt).getTime()) ? format(new Date(invoice.createdAt), 'hh:mm a, dd MMM yyyy') : '-';
    const billedBy = invoice?.billedByName || user?.name || 'Staff';
    const mode = String(invoice?.paymentMode || '').toUpperCase();

    // Same sentence the invoice page's WhatsApp button sends, plus the amount and (when the bill has an id) the link
    const buildText = () => {
        const link = invoice?.id && typeof window !== 'undefined' ? `${window.location.origin}/billing/${invoice.id}` : '';
        const base = `Your invoice ${invoice?.invoiceNo} from MediFlow Pharmacy for ₹${formatINR(amount)}. Thank you!`;
        return { base, link, full: link ? `${base}\n${link}` : base };
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: 'Link copied' });
        } catch {
            toast({ variant: 'destructive', title: 'Could not copy', description: 'Copy the invoice number by hand instead.' });
        }
    };

    const handleShare = async () => {
        const { base, link, full } = buildText();
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({ title: `Invoice ${invoice?.invoiceNo}`, text: link ? `${base}\n${link}` : base });
                return;
            } catch (e: any) {
                if (e?.name === 'AbortError') return;          // the cashier closed the share sheet: nothing to do
            }
        }
        await copyText(full);
    };

    const handleWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(buildText().full)}`, '_blank', 'noopener');
    };

    return (
        <div data-testid="invoice-success" className="flex min-h-dvh flex-col bg-white">
            <div className="flex flex-1 flex-col items-center px-4 pt-24 text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 shadow-md">
                    <CheckCircle2 className="h-14 w-14 text-white" aria-hidden />
                </div>
                <h2 className="mt-4 text-3xl font-black text-slate-900">Bill saved</h2>

                <div className={cn(T.card, 'mt-6 w-full max-w-sm px-4 py-4')}>
                    <p className={T.label}>Invoice number</p>
                    <div data-testid="invoice-number" className="mt-1 break-all font-mono text-2xl font-black text-slate-900">{invoice?.invoiceNo}</div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-300 pt-4 text-left text-sm">
                        <dt className="font-semibold text-slate-700">Amount</dt><dd data-testid="invoice-amount" className={cn(T.money, 'text-right font-bold text-slate-900')}>₹{formatINR(amount)}</dd>
                        <dt className="font-semibold text-slate-700">Paid by</dt><dd className="text-right font-semibold text-slate-900">{mode || '-'}</dd>
                        <dt className="font-semibold text-slate-700">Time</dt><dd className="text-right font-semibold text-slate-900">{created}</dd>
                        <dt className="font-semibold text-slate-700">Billed by</dt><dd className="text-right font-semibold text-slate-900">{billedBy}</dd>
                    </dl>
                </div>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                <button type="button" onClick={onNewBill} className={cn(btn, T.cta, 'min-h-[56px] h-14 text-lg')}>
                    <Plus className="h-6 w-6" aria-hidden />New bill
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={onPrint} className={cn(btn, T.ctaOutline)}>
                        <Printer className="h-5 w-5" aria-hidden />Print
                    </button>
                    <button type="button" onClick={handleShare} className={cn(btn, T.btn)}>
                        <Share2 className="h-5 w-5" aria-hidden />Share
                    </button>
                </div>
                <button type="button" onClick={handleWhatsApp} className={cn(btn, 'rounded-xl border-2 border-emerald-700 bg-white font-bold text-emerald-700 transition-colors active:bg-emerald-50')}>
                    <MessageCircle className="h-5 w-5" aria-hidden />WhatsApp
                </button>
                <button type="button" onClick={onViewInvoice} className="flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl text-base font-bold text-sky-700 active:bg-sky-50">
                    <FileText className="h-5 w-5" aria-hidden />View invoice
                </button>
            </div>
        </div>
    );
}
