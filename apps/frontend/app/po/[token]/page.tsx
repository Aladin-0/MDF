'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Phone, Printer } from 'lucide-react';
import { fetchPublicPO, money, type PublicPO } from '@/lib/poApi';

const STATUS_NOTE: Record<string, { text: string; cls: string }> = {
    SENT: { text: 'Open order', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    PARTIAL: { text: 'Partly received', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    COMPLETED: { text: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    CANCELLED: { text: 'Cancelled by the store', cls: 'bg-red-50 text-red-700 border-red-200' },
    EXPIRED: { text: 'Expired', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * The page a distributor opens from the WhatsApp link. No login, read-only, mobile-first. It lives outside the dashboard, so none of the
 * app chrome (menus, session sync) loads here.
 */
export default function PublicPurchaseOrderPage() {
    const { token } = useParams<{ token: string }>();
    const [po, setPo] = useState<PublicPO | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { fetchPublicPO(token).then(setPo).catch((e) => setError(e.message)); }, [token]);

    if (error) {
        return (
            <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
                <h1 className="text-xl font-semibold">This order link is not available</h1>
                <p className="text-sm text-slate-500">{error} Please ask the store to send it again.</p>
            </main>
        );
    }
    if (!po) return <main className="mx-auto max-w-2xl p-6 text-sm text-slate-500">Loading order…</main>;

    const note = STATUS_NOTE[po.status];
    const totalQty = po.items.reduce((s, i) => s + i.qty, 0);

    return (
        <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
            <header className="space-y-1 border-b pb-4">
                <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Purchase order from</p>
                <h1 className="text-2xl font-bold tracking-tight break-words">{po.storeName}</h1>
                {po.storeAddress && <p className="text-sm text-slate-500">{po.storeAddress}</p>}
            </header>

            <section className="grid gap-3 rounded-lg border bg-white p-4 grid-cols-2 sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">PO number</p><p className="font-semibold">{po.poNumber}</p></div>
                <div><p className="text-xs text-slate-500">Date</p><p className="font-semibold">{fmt(po.orderDate)}</p></div>
                <div><p className="text-xs text-slate-500">Expected</p><p className="font-semibold">{po.expectedDate ? fmt(po.expectedDate) : '—'}</p></div>
                <div><p className="text-xs text-slate-500">To</p><p className="font-semibold">{po.distributorName}</p></div>
            </section>

            {note && <div className={`rounded-md border px-3 py-2 text-sm font-medium ${note.cls}`}>{note.text}{po.status === 'CANCELLED' && po.cancelReason ? `: ${po.cancelReason}` : ''}</div>}
            {po.notes && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><b>Note:</b> {po.notes}</p>}

            <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Pack</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">MRP</th>{po.showRates && <><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></>}</tr>
                    </thead>
                    <tbody className="divide-y">
                        {po.items.map((i, k) => (
                            <tr key={k}>
                                <td className="px-3 py-2 font-medium">{i.productName}</td><td className="px-3 py-2 text-slate-500">{i.packLabel || '—'}</td>
                                <td className="px-3 py-2 text-right font-semibold">{i.qty}</td><td className="px-3 py-2 text-right text-slate-500">{i.mrp ? money(i.mrp) : '—'}</td>
                                {po.showRates && <><td className="px-3 py-2 text-right">{i.rate ? money(i.rate) : '—'}</td><td className="px-3 py-2 text-right font-semibold">{i.lineTotal ? money(i.lineTotal) : '—'}</td></>}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-semibold">
                        <tr><td className="px-3 py-2" colSpan={2}>{po.items.length} items</td><td className="px-3 py-2 text-right">{totalQty}</td><td className="px-3 py-2" />{po.showRates && <><td className="px-3 py-2" /><td className="px-3 py-2 text-right">{po.totalAmount ? money(po.totalAmount) : ''}</td></>}</tr>
                    </tfoot>
                </table>
            </div>

            <div className="flex flex-wrap gap-3 print:hidden">
                <button type="button" onClick={() => window.print()} className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-md border px-4 py-2.5 sm:py-2 text-sm font-medium hover:bg-slate-50"><Printer className="h-4 w-4" />Print / save as PDF</button>
                {po.storePhone && <a href={`tel:${po.storePhone}`} className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-blue-700"><Phone className="h-4 w-4" />Call {po.storeName}</a>}
            </div>
            <p className="text-xs text-slate-400 print:hidden">This is a read-only view. Contact the store for any change.</p>
        </main>
    );
}
