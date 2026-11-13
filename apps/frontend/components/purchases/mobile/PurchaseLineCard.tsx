'use client';

import { AlertTriangle, CalendarClock, CalendarX } from 'lucide-react';
import type { PurchaseItemFormData } from '@/types';
import { cn } from '@/lib/utils';
import { T } from '@/components/billing/mobile/theme';
import { fmt, effectivePkg, lineAmount } from '@/lib/purchaseEntry';
import { parsePkg } from '@/lib/purchasePack';
import { formatExpiryForDisplay, getExpiryStatus, issueText, lineIssues } from '@/lib/purchaseLine';

interface PurchaseLineCardProps {
    item: PurchaseItemFormData;
    /** 1-based number shown on the card */
    number: number;
    onEdit: () => void;
}

const BAR: Record<string, string> = { expired: 'bg-red-600', near: 'bg-amber-500', ok: 'bg-emerald-500' };

/** One labelled value of the folded row: the name is the desktop column header (QTY, MRP, RATE ...) */
function Fig({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
    return (
        <span className="flex min-w-0 flex-col">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{label}</span>
            <span data-testid={testId} className={cn('truncate text-sm font-extrabold text-slate-900', T.money)}>{children}</span>
        </span>
    );
}

/** One medicine on the phone purchase: what was entered, what is still missing, the amount. Tap it to edit (there are no fields on the card). */
export function PurchaseLineCard({ item, number, onEdit }: PurchaseLineCardProps) {
    const status = getExpiryStatus(item.expiryDate);
    const issues = lineIssues(item);
    const units = item.qty * effectivePkg(item.pkg);
    const lowConfidence = !!item.ocrOriginalName && !!item.productId && (item.ocrMatchConfidence ?? 1) < 0.9;
    return (
        <li
            data-testid="purchase-line-card"
            className={cn('relative overflow-hidden rounded-xl border shadow-sm', issues.length ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white')}
        >
            <span aria-hidden data-testid="expiry-bar" data-status={status} className={cn('absolute inset-y-0 left-0 w-1.5', BAR[status])} />
            <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit medicine ${number}: ${item.productName || 'not chosen yet'}`}
                className="flex min-h-[44px] w-full touch-manipulation flex-col gap-1.5 py-3 pl-4 pr-3 text-left active:bg-slate-50"
            >
                <span className="flex w-full items-start justify-between gap-3">
                    <span className="min-w-0">
                        <span className="line-clamp-2 text-base font-extrabold uppercase leading-snug text-slate-900">{item.productName || 'Medicine not chosen'}</span>
                        {item.packUnitLabel && <span className="mt-0.5 block truncate text-sm text-slate-600">{item.pkg > 1 ? `${item.pkg} ` : ''}{item.packUnitLabel} per pack</span>}
                    </span>
                    <span data-testid="line-amount" className={cn('shrink-0 text-xl font-black text-slate-900', T.money)}>{fmt(lineAmount(item))}</span>
                </span>

                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {item.batchNo && <span className={T.tag}>B: {item.batchNo}</span>}
                    {item.expiryDate && (
                        <span className={cn(T.tag, status === 'expired' && 'border-red-400 bg-red-50 text-red-800', status === 'near' && 'border-amber-400 bg-amber-50 text-amber-900')}>
                            Exp: {formatExpiryForDisplay(item.expiryDate)}
                        </span>
                    )}
                </span>

                {/* the desktop row's columns, folded: the same names, in the same order */}
                <span data-testid="line-figures" className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                    <Fig label="Qty" testId="card-qty"><span className="rounded-md bg-slate-900 px-2 py-0.5 text-sm font-extrabold text-white">{item.qty || 0}</span></Fig>
                    <Fig label="Free" testId="card-free">{item.freeQty || 0}</Fig>
                    <Fig label="Pkg" testId="card-pkg">{parsePkg(item.pkg).ok ? item.pkg : '?'}{item.packUnitLabel ? <span className="ml-1 text-xs font-semibold text-slate-700">{item.packUnitLabel}</span> : null}</Fig>
                    <Fig label="MRP" testId="card-mrp">{fmt(item.mrp || 0)}</Fig>
                    <Fig label="Rate" testId="card-rate">{fmt(item.purchaseRate || 0)}</Fig>
                    <Fig label="GST%" testId="card-gst">{item.gstRate}</Fig>
                    {item.discountPct > 0 && <Fig label="Disc%" testId="card-disc">{parseFloat(item.discountPct.toFixed(2))}</Fig>}
                    {item.ptr > 0 && <Fig label="PTR" testId="card-ptr">{fmt(item.ptr)}</Fig>}
                    {item.pts > 0 && <Fig label="PTS" testId="card-pts">{fmt(item.pts)}</Fig>}
                </span>
                {units > 0 && item.pkg > 1 && <span data-testid="card-units" className={cn('text-xs font-semibold text-slate-700', T.money)}>= {units} units{item.freeQty > 0 ? ` + ${item.freeQty * effectivePkg(item.pkg)} free` : ''}</span>}

                {status !== 'ok' && (
                    <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold', status === 'expired' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900')}>
                        {status === 'expired' ? <CalendarX className="h-3.5 w-3.5" aria-hidden /> : <CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                        {status === 'expired' ? 'Expired' : 'Expires within 90 days'}
                    </span>
                )}
                {lowConfidence && (
                    <span className="text-xs font-bold text-amber-900">Bill says “{item.ocrOriginalName}” · please confirm the medicine</span>
                )}
                {issues.length > 0 && (
                    <span data-testid="line-issues" className="flex flex-wrap gap-1.5">
                        {issues.slice(0, 3).map((i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-amber-200 px-2 py-1 text-xs font-bold text-amber-950">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{issueText(i)}
                            </span>
                        ))}
                    </span>
                )}
            </button>
        </li>
    );
}
