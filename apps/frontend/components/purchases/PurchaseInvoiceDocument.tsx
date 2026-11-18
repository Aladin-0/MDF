import { format } from 'date-fns';
import { amountInWords, fmtAmt } from '@/components/print/ManavataA4Invoice';
import type { PurchaseInvoiceFull } from '@/types';
import { expiryShort, modeWord, packText, qtyText, sumTax, taxMode, taxSummary } from '@/lib/purchaseInvoiceView';
import { cn } from '@/lib/utils';

/** A4 portrait at 96 dpi: the screen preview and the printed page are this same element, so what you see is what prints. */
export const PURCHASE_PAPER_WIDTH_PX = 794;

export interface Letterhead { name: string; address: string; city: string; phone: string; gstin: string; drugLicenseNo: string; state: string; logoUrl?: string }

interface Props {
    invoice: PurchaseInvoiceFull;
    letterhead: Letterhead;
    statusLabel: string;
    statusClasses: string;
    loadingItems?: boolean;
}

const dmy = (v?: string) => { try { return v ? format(new Date(v), 'dd-MMM-yyyy') : ''; } catch { return v ?? ''; } };
const money = (n?: number | null) => fmtAmt(Number(n) || 0);

function Kv({ k, v, bold }: { k: string; v?: React.ReactNode; bold?: boolean }) {
    if (v === undefined || v === null || v === '') return null;
    return <p className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className={cn('text-right', bold && 'font-bold')}>{v}</span></p>;
}

/** The purchase invoice as a document: letterhead, supplier, items, GST summary, totals in figures and words, payment, signatures. */
export function PurchaseInvoiceDocument({ invoice, letterhead: l, statusLabel, statusClasses, loadingItems }: Props) {
    const d = invoice;
    const items = d.items ?? [];
    const mode = taxMode(d.distributor?.state, l.state);
    const tax = taxSummary(items, mode);
    const taxTotal = sumTax(tax);
    const discount = Number(d.discountAmount) || 0;
    const invoiceDiscount = Number(d.invoiceDiscount) || 0;
    const goods = items.reduce((n, it) => n + (it.qty + it.freeQty) * it.purchaseRate, 0);
    const base = goods - discount;
    const invoiceDiscountPct = base > 0 ? (invoiceDiscount / base) * 100 : 0;
    const adj = Number(d.ledgerAdjustment ?? 0);
    const payments = (d.payments ?? []).filter((p) => Number(p.amount) > 0);
    const paidVia = payments.length ? payments.map((p) => `${modeWord(p.method)} ${money(p.amount)}`).join(' · ') : (Number(d.amountPaid) > 0 ? modeWord(d.paymentMode as string) : '');

    return (
        <div id="purchase-print-root" role="document" aria-label={`Purchase invoice ${d.invoiceNo}`} className="w-full bg-white text-[11px] leading-snug text-slate-900" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            <div className="border border-slate-900">
                {/* ── letterhead + invoice facts ── */}
                <div className="flex border-b border-slate-900">
                    <div className="flex min-w-0 flex-1 items-start gap-3 border-r border-slate-900 p-3">
                        {l.logoUrl && <img src={l.logoUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />}
                        <div className="min-w-0">
                            <h1 className="break-words text-[18px] font-bold uppercase leading-tight tracking-wide">{l.name || 'Pharmacy'}</h1>
                            <p className="mt-0.5 text-slate-600">{[l.address, l.city].filter(Boolean).join(', ')}</p>
                            <p className="text-slate-600">{[l.phone && `Ph: ${l.phone}`, l.gstin && `GSTIN: ${l.gstin}`].filter(Boolean).join('   ')}</p>
                            {l.drugLicenseNo && <p className="text-slate-600">DL: {l.drugLicenseNo}</p>}
                        </div>
                    </div>
                    <div className="w-[270px] shrink-0">
                        <div className="bg-slate-900 py-1.5 text-center text-[13px] font-bold uppercase tracking-[0.2em] text-white">Purchase Invoice</div>
                        <div className="space-y-0.5 p-2.5">
                            <Kv k="Invoice No" v={d.invoiceNo} bold />
                            <Kv k="Invoice date" v={dmy(d.invoiceDate)} />
                            <Kv k="Due date" v={dmy(d.dueDate)} />
                            <Kv k="Type" v={d.purchaseType ? <span className="capitalize">{d.purchaseType}</span> : ''} />
                            <Kv k="PO reference" v={d.purchaseOrderRef} />
                            <p className="flex items-center justify-between pt-1"><span className="text-slate-500">Status</span><span className={cn('rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusClasses)}>{statusLabel}</span></p>
                        </div>
                    </div>
                </div>

                {/* ── supplier / received at ── */}
                <div className="grid grid-cols-2 border-b border-slate-900">
                    <div className="border-r border-slate-900 p-3">
                        <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Supplier</p>
                        <p className="break-words text-[14px] font-bold">{d.distributor?.name || 'Unknown supplier'}</p>
                        {d.distributor?.address && <p className="whitespace-pre-wrap text-slate-700">{d.distributor.address}</p>}
                        {(d.distributor?.city || d.distributor?.state) && <p className="text-slate-700">{[d.distributor?.city, d.distributor?.state].filter(Boolean).join(', ')}</p>}
                        <p className="mt-1 text-slate-700">{[d.distributor?.phone && `Ph: ${d.distributor.phone}`, d.distributor?.gstin && `GSTIN: ${d.distributor.gstin}`].filter(Boolean).join('   ')}</p>
                        {d.distributor?.drugLicenseNo && <p className="text-slate-700">DL No: {d.distributor.drugLicenseNo}</p>}
                    </div>
                    <div className="p-3">
                        <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Received at</p>
                        <p className="break-words text-[14px] font-bold">{l.name || 'Pharmacy'}</p>
                        <p className="text-slate-700">{[l.address, l.city].filter(Boolean).join(', ')}</p>
                        {l.state && <p className="text-slate-700">{l.state}</p>}
                        {l.gstin && <p className="mt-1 text-slate-700">GSTIN: {l.gstin}</p>}
                        {d.godown && typeof d.godown === 'string' && <p className="text-slate-700">Stored in: <span className="capitalize">{d.godown}</span></p>}
                    </div>
                </div>

                {/* ── items ── */}
                <table className="w-full table-fixed border-collapse text-[10.5px]">
                    <caption className="sr-only">Items on this purchase invoice</caption>
                    <colgroup>
                        {['4%', '26%', '10%', '6.5%', '6%', '9%', '8%', '8%', '6%', '6%', '10.5%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <thead className="[display:table-header-group]">
                        <tr className="bg-slate-100 text-[9.5px] uppercase tracking-wide">
                            <th scope="col" className="border-b border-r border-slate-300 px-1 py-1.5 text-center">SN</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1.5 py-1.5 text-left">Product</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1.5 py-1.5 text-left">Batch</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1 py-1.5 text-center">Exp</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1 py-1.5 text-center">Pack</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1.5 py-1.5 text-right">Qty</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1.5 py-1.5 text-right">MRP</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1.5 py-1.5 text-right">Rate</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1 py-1.5 text-right">Disc %</th>
                            <th scope="col" className="border-b border-r border-slate-300 px-1 py-1.5 text-right">GST %</th>
                            <th scope="col" className="border-b border-slate-300 px-1.5 py-1.5 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingItems && <tr><td colSpan={11} className="px-2 py-8 text-center text-slate-500">Loading items…</td></tr>}
                        {!loadingItems && items.length === 0 && <tr><td colSpan={11} className="px-2 py-8 text-center italic text-slate-500">No items found for this invoice.</td></tr>}
                        {!loadingItems && items.map((it, i) => {
                            const q = qtyText(it);
                            return (
                                <tr key={it.id || i} className="break-inside-avoid border-b border-slate-200 align-top even:bg-slate-50/60">
                                    <td className="border-r border-slate-200 px-1 py-1.5 text-center text-slate-500">{i + 1}</td>
                                    <td className="border-r border-slate-200 px-1.5 py-1.5">
                                        <p className="break-words font-semibold uppercase">{it.product?.name ?? it.customProductName ?? '—'}</p>
                                        {(it.product?.manufacturer || it.hsnCode) && <p className="text-[9px] text-slate-500">{[it.product?.manufacturer, it.hsnCode && `HSN ${it.hsnCode}`].filter(Boolean).join(' · ')}</p>}
                                    </td>
                                    <td className="break-all border-r border-slate-200 px-1.5 py-1.5 font-mono">{it.batchNo}</td>
                                    <td className="border-r border-slate-200 px-1 py-1.5 text-center tabular-nums">{expiryShort(it.expiryDate)}</td>
                                    <td className="border-r border-slate-200 px-1 py-1.5 text-center tabular-nums text-slate-600">{packText(it)}</td>
                                    <td className="border-r border-slate-200 px-1.5 py-1.5 text-right tabular-nums"><span className="font-semibold">{q.main}</span>{q.free && <span className="block text-[9px] font-medium text-emerald-700">{q.free}</span>}</td>
                                    <td className="border-r border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{money(it.mrp)}</td>
                                    <td className="border-r border-slate-200 px-1.5 py-1.5 text-right tabular-nums">{money(it.purchaseRate)}</td>
                                    <td className="border-r border-slate-200 px-1 py-1.5 text-right tabular-nums">{Number(it.discountPct) || 0}{Number(it.cashDiscountPct) > 0 && <span className="block text-[9px] text-slate-500">+{it.cashDiscountPct} CD</span>}</td>
                                    <td className="border-r border-slate-200 px-1 py-1.5 text-right tabular-nums">{Number(it.gstRate) || 0}</td>
                                    <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">{money(it.totalAmount)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* ── tax summary + totals ── */}
                <div className="grid break-inside-avoid grid-cols-[1fr_285px] border-t border-slate-900">
                    <div className="space-y-3 border-r border-slate-900 p-3">
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Amount in words</p>
                            <p className="mt-0.5 font-semibold">{amountInWords(d.grandTotal)}</p>
                        </div>
                        {tax.length > 0 && (
                            <table className="w-full border-collapse text-[10px]">
                                <caption className="mb-1 text-left text-[9px] font-bold uppercase tracking-widest text-slate-500">GST summary</caption>
                                <thead>
                                    <tr className="bg-slate-100">
                                        <th scope="col" className="border border-slate-300 px-1.5 py-1 text-left">Rate</th>
                                        <th scope="col" className="border border-slate-300 px-1.5 py-1 text-right">Taxable</th>
                                        {mode === 'intra' && <><th scope="col" className="border border-slate-300 px-1.5 py-1 text-right">CGST</th><th scope="col" className="border border-slate-300 px-1.5 py-1 text-right">SGST</th></>}
                                        {mode === 'inter' && <th scope="col" className="border border-slate-300 px-1.5 py-1 text-right">IGST</th>}
                                        {mode === 'unknown' && <th scope="col" className="border border-slate-300 px-1.5 py-1 text-right">GST</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tax.map((r) => (
                                        <tr key={r.rate}>
                                            <td className="border border-slate-300 px-1.5 py-0.5">{r.rate}%</td>
                                            <td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(r.taxable)}</td>
                                            {mode === 'intra' && <><td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(r.cgst)}</td><td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(r.sgst)}</td></>}
                                            {mode === 'inter' && <td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(r.igst)}</td>}
                                            {mode === 'unknown' && <td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(r.gst)}</td>}
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50 font-bold">
                                        <td className="border border-slate-300 px-1.5 py-0.5">Total</td>
                                        <td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(taxTotal.taxable)}</td>
                                        {mode === 'intra' && <><td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(taxTotal.cgst)}</td><td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(taxTotal.sgst)}</td></>}
                                        {mode === 'inter' && <td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(taxTotal.igst)}</td>}
                                        {mode === 'unknown' && <td className="border border-slate-300 px-1.5 py-0.5 text-right tabular-nums">{money(taxTotal.gst)}</td>}
                                    </tr>
                                </tbody>
                            </table>
                        )}
                        {d.notes && <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Notes</p><p className="mt-0.5 whitespace-pre-wrap italic text-slate-700">{d.notes}</p></div>}
                    </div>

                    <div className="p-3">
                        <div className="space-y-1">
                            <Kv k="Goods value" v={money(d.subtotal)} />
                            {discount > 0 && <Kv k="Item discounts" v={`− ${money(discount)}`} />}
                            {invoiceDiscount > 0 && <Kv k={`Invoice discount (${invoiceDiscountPct.toFixed(2)}%)`} v={`− ${money(invoiceDiscount)}`} />}
                            <Kv k="Taxable amount" v={money(d.taxableAmount)} />
                            <Kv k="GST" v={money(d.gstAmount)} />
                            {Number(d.cessAmount) > 0 && <Kv k="Cess" v={money(d.cessAmount)} />}
                            {Number(d.freight) > 0 && <Kv k="Freight" v={money(d.freight)} />}
                            {Number(d.roundOff) !== 0 && !!Number(d.roundOff) && <Kv k="Round off" v={`${Number(d.roundOff) > 0 ? '+' : '−'} ${money(Math.abs(Number(d.roundOff)))}`} />}
                            {adj !== 0 && <Kv k={d.ledgerNote ? `Ledger adjustment (${d.ledgerNote})` : 'Ledger adjustment'} v={`${adj < 0 ? '+' : '−'} ${money(Math.abs(adj))}`} />}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-y-2 border-slate-900 py-1.5 text-[14px] font-bold">
                            <span>Grand total</span><span className="tabular-nums">₹ {money(d.grandTotal)}</span>
                        </div>
                        <div className="mt-2 space-y-1">
                            <Kv k="Paid" v={`₹ ${money(d.amountPaid)}`} />
                            {paidVia && <p className="text-right text-[9.5px] text-slate-500">{paidVia}</p>}
                            <p className="flex justify-between font-bold"><span>Outstanding</span><span className={cn('tabular-nums', Number(d.outstanding) > 0 ? 'text-red-700' : 'text-emerald-700')}>₹ {money(d.outstanding)}</span></p>
                        </div>
                    </div>
                </div>

                {/* ── signatures ── */}
                <div className="grid break-inside-avoid grid-cols-2 gap-10 border-t border-slate-900 px-3 pb-2 pt-10 text-center text-[10px] text-slate-600">
                    <p className="border-t border-slate-400 pt-1">Received by{d.createdByName ? ` (${d.createdByName})` : ''}</p>
                    <p className="border-t border-slate-400 pt-1">Authorised signatory</p>
                </div>
            </div>
            <p className="mt-1.5 text-center text-[9px] text-slate-500">Computer generated purchase record{l.name ? ` · ${l.name}` : ''}</p>
        </div>
    );
}
