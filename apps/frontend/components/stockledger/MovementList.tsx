'use client';

import { AlertTriangle, Eye, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDay, formatMonth } from '@/lib/dates';
import { EVENT_TONE, TONE_CLASSES, asInvoiceRef, expiryTone, formatInr, formatTime, packsText, signedPacksText, type InvoiceRef, type LedgerEntry } from '@/lib/stockLedger';
import { cn } from '@/lib/utils';

interface Props {
    entries: LedgerEntry[];
    loading: boolean;
    dimmed?: boolean;
    hasFilters: boolean;
    onClearFilters: () => void;
    /** hidden when one batch is selected: the product and batch are named above the list */
    showProduct: boolean;
    showValues: boolean;
    /** opens the sale or purchase invoice a row came from; a kind it returns false for stays plain text */
    onOpenInvoice?: (ref: InvoiceRef) => void;
    canOpen?: (kind: InvoiceRef['kind']) => boolean;
}

const NEG_TITLE = "This batch's history has no opening balance, so the running balance went below zero. Stock itself is right.";

function EventBadge({ e }: { e: LedgerEntry }) {
    const tone = TONE_CLASSES[EVENT_TONE[e.event] ?? 'neutral'];
    return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', tone.badge)}><span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />{e.event_label}</span>;
}

/** "Ramesh · Sale Invoice INV-2231" / the reason of a write-off, on ONE line under the event. The invoice reference opens the invoice. */
function Story({ e, onOpen }: { e: LedgerEntry; onOpen?: (ref: InvoiceRef) => void }) {
    const ref = onOpen ? asInvoiceRef(e.source) : null;
    const parts = [e.counterparty, ref ? '' : e.detail].filter(Boolean);
    if (!parts.length && !ref) return null;
    return (
        <p className="mt-1 flex max-w-[26rem] flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground max-md:max-w-none" title={[...parts, e.detail].filter(Boolean).join(' · ')}>
            {parts.length > 0 && <span className="truncate">{parts.join(' · ')}</span>}
            {parts.length > 0 && ref && <span aria-hidden="true">·</span>}
            {ref && (
                <button type="button" onClick={() => onOpen!(ref)} aria-label={`Open ${ref.kind === 'sale' ? 'sale' : 'purchase'} invoice: ${e.detail}`}
                    className="inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {e.detail} <Eye className="h-3 w-3" aria-hidden="true" />
                </button>
            )}
        </p>
    );
}

function ProductCell({ e }: { e: LedgerEntry }) {
    const exp = e.expiry_date ? expiryTone(e.expiry_date) : null;
    return (
        <>
            <p className="truncate font-medium" title={e.product_name}>{e.product_name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                <span translate="no" className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">{e.batch_number}</span>
                {e.expiry_date && <span className={cn('whitespace-nowrap tabular-nums', exp === 'expired' ? 'font-medium text-destructive' : exp === 'soon' ? 'font-medium text-amber-700' : 'text-muted-foreground')}>Exp {formatMonth(e.expiry_date)}{exp === 'expired' ? ' · expired' : ''}</span>}
            </p>
        </>
    );
}

function Qty({ e, showValues }: { e: LedgerEntry; showValues: boolean }) {
    const value = e.qty >= 0 ? e.value_in : e.value_out;
    return (
        <>
            <p className={cn('whitespace-nowrap font-semibold tabular-nums', e.qty > 0 ? 'text-emerald-700' : e.qty < 0 ? 'text-rose-700' : 'text-muted-foreground', e.event === 'bookkeeping' && 'font-normal text-muted-foreground')}>{signedPacksText(e.qty, e)}</p>
            {showValues && value !== null && value > 0 && <p className="text-xs text-muted-foreground tabular-nums">{formatInr(value)}</p>}
        </>
    );
}

function Balance({ e, showValues }: { e: LedgerEntry; showValues: boolean }) {
    return (
        <>
            <p className={cn('flex items-center justify-end gap-1 whitespace-nowrap font-semibold tabular-nums', e.balance_negative && 'text-destructive')} title={e.balance_negative ? NEG_TITLE : undefined}>
                {e.balance_negative && <AlertTriangle className="h-3.5 w-3.5" aria-label="History incomplete" />}
                {e.balance_negative ? '−' : ''}{packsText(e.running_qty, e)}
            </p>
            {showValues && e.running_value !== null && <p className="text-xs text-muted-foreground tabular-nums">{formatInr(e.running_value)}</p>}
        </>
    );
}

export function MovementList({ entries, loading, dimmed, hasFilters, onClearFilters, showProduct, showValues, onOpenInvoice, canOpen }: Props) {
    // only offer the link for what this person is allowed to open (the API would refuse the rest)
    const open = onOpenInvoice ? (ref: InvoiceRef) => { if (!canOpen || canOpen(ref.kind)) onOpenInvoice(ref); } : undefined;
    const linkFor = (e: LedgerEntry) => { const r = asInvoiceRef(e.source); return open && r && (!canOpen || canOpen(r.kind)) ? open : undefined; };
    if (loading) return <div className="space-y-2 p-3" role="status" aria-label="Loading movements">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
    if (entries.length === 0) {
        return (
            <div className="px-6 py-14 text-center">
                <Inbox className="mx-auto h-9 w-9 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-3 font-medium">{hasFilters ? 'No movements match your filters' : 'No stock movements in this period'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{hasFilters ? 'Try removing a filter or widening the dates.' : 'Pick a longer date range to see earlier activity.'}</p>
                {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>Clear filters</Button>}
            </div>
        );
    }
    return (
        <div className={cn(dimmed && 'opacity-60 transition-opacity')} aria-busy={dimmed}>
            {/* tablet / desktop */}
            <div className="hidden max-h-[70dvh] overflow-auto md:block">
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                    <caption className="sr-only">Stock movements, newest first. Quantities are in the batch&apos;s own units; a red balance means the batch&apos;s history is incomplete.</caption>
                    <thead className="sticky top-0 z-10 bg-muted/90 text-xs text-muted-foreground backdrop-blur">
                        <tr>
                            <th scope="col" className="px-3 py-2.5 text-left font-medium">Date</th>
                            <th scope="col" className="px-3 py-2.5 text-left font-medium">What happened</th>
                            {showProduct && <th scope="col" className="px-3 py-2.5 text-left font-medium">Product and batch</th>}
                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Quantity</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {entries.map((e) => (
                            <tr key={e.id} className={cn('align-top hover:bg-muted/30', e.event === 'bookkeeping' && 'bg-muted/20 text-muted-foreground')}>
                                <td className="whitespace-nowrap px-3 py-2.5"><p className="font-medium tabular-nums">{formatDay(e.txn_date)}</p><p className="text-xs text-muted-foreground tabular-nums">{formatTime(e.created_at)}</p></td>
                                <td className="px-3 py-2.5"><EventBadge e={e} /><Story e={e} onOpen={linkFor(e)} /></td>
                                {showProduct && <td className="max-w-[16rem] px-3 py-2.5"><ProductCell e={e} /></td>}
                                <td className="px-3 py-2.5 text-right"><Qty e={e} showValues={showValues} /></td>
                                <td className="px-3 py-2.5 text-right"><Balance e={e} showValues={showValues} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* phone: a card per movement */}
            <ul className="divide-y md:hidden" aria-label="Stock movements">
                {entries.map((e) => (
                    <li key={e.id} className={cn('space-y-2 px-3 py-3', e.event === 'bookkeeping' && 'bg-muted/20')}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><EventBadge e={e} /><Story e={e} onOpen={linkFor(e)} /></div>
                            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDay(e.txn_date)}</p>
                        </div>
                        {showProduct && <div className="min-w-0"><ProductCell e={e} /></div>}
                        <div className="flex items-end justify-between gap-3 border-t pt-2">
                            <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quantity</p><Qty e={e} showValues={showValues} /></div>
                            <div className="text-right"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p><Balance e={e} showValues={showValues} /></div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
