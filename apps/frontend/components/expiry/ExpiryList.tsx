'use client';

import { Fragment, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/gst';
import { formatDay } from '@/lib/dates';
import {
    daysText, distributorText, groupConsecutive, stockText, toneOf,
    type ExpiryGroup, type ExpiryRow, type Selection, type Tone,
} from '@/lib/expiryManager';
import { cn } from '@/lib/utils';

const TONE_BADGE: Record<Tone, string> = {
    expired: 'bg-red-600 text-white',
    critical: 'bg-red-100 text-red-800',
    warning: 'bg-amber-100 text-amber-900',
    ok: 'bg-muted text-muted-foreground',
};
const TONE_ROW: Record<Tone, string> = { expired: 'bg-red-50/60', critical: '', warning: '', ok: '' };

export function DaysBadge({ days }: { days: number }) {
    // words, not only colour (an expired batch must read as expired to anyone)
    return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONE_BADGE[toneOf(days)])}>{daysText(days)}</span>;
}

interface Props {
    rows: ExpiryRow[];
    groups: ExpiryGroup[];
    grouped: boolean;
    selection: Selection;
    showCost: boolean;
    onToggle: (id: string) => void;
    onTogglePage: (ids: string[]) => void;
    busy?: boolean;
}

/** A checkbox that can show "some of these are ticked". */
function Tick({ checked, some, label, onChange, className }: { checked: boolean; some?: boolean; label: string; onChange: () => void; className?: string }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { if (ref.current) ref.current.indeterminate = !!some && !checked; }, [some, checked]);
    return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className={cn('h-5 w-5 cursor-pointer rounded border-input accent-[hsl(var(--primary))]', className)} />;
}

export function ExpiryList({ rows, groups, grouped, selection, showCost, onToggle, onTogglePage, busy }: Props) {
    const ticked = new Set(selection.ids);
    const pageIds = rows.map((r) => r.id);
    const pageAll = rows.length > 0 && rows.every((r) => ticked.has(r.id));
    const pageSome = rows.some((r) => ticked.has(r.id));
    const sections = grouped ? groupConsecutive(rows) : [{ key: 'all', name: '', rows }];
    const serverGroup = (key: string) => groups.find((g) => (g.distributorId ?? 'none') === key);
    const valueOf = (r: ExpiryRow) => (showCost && r.costValue !== undefined ? r.costValue : r.mrpValue);

    return (
        <div className={cn(busy && 'opacity-60 transition-opacity')} aria-busy={busy}>
            {/* tablet / desktop: a table */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                    <caption className="sr-only">Batches expiring in the chosen window. Tick rows to export, return or remove them.</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                            <th scope="col" className="w-10 px-3 py-2.5"><Tick checked={pageAll} some={pageSome} label="Select every batch on this page" onChange={() => onTogglePage(pageIds)} /></th>
                            <th scope="col" className="px-2 py-2.5 text-left font-medium">Product</th>
                            <th scope="col" className="px-2 py-2.5 text-left font-medium">Batch</th>
                            <th scope="col" className="px-2 py-2.5 text-left font-medium">Expiry</th>
                            <th scope="col" className="px-2 py-2.5 text-right font-medium">In stock</th>
                            <th scope="col" className="px-2 py-2.5 text-right font-medium">{showCost ? 'Cost value' : 'MRP value'}</th>
                            <th scope="col" className="px-2 py-2.5 text-left font-medium">Distributor</th>
                            <th scope="col" className="px-2 py-2.5 text-left font-medium">Rack</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {sections.map((s) => {
                            const ids = s.rows.map((r) => r.id);
                            const sg = serverGroup(s.key);
                            return (
                                <Fragment key={s.key + ids[0]}>
                                    {grouped && (
                                        <tr className="bg-muted/40">
                                            <td className="px-3 py-2"><Tick checked={ids.every((id) => ticked.has(id))} some={ids.some((id) => ticked.has(id))} label={`Select this page's batches from ${s.name}`} onChange={() => onTogglePage(ids)} /></td>
                                            <th scope="rowgroup" colSpan={7} className="px-2 py-2 text-left text-sm font-semibold">
                                                {s.name}
                                                {sg && <span className="ml-2 font-normal text-muted-foreground">{sg.batches} {sg.batches === 1 ? 'batch' : 'batches'} · {formatCurrency(sg.costValue ?? sg.mrpValue)} in total</span>}
                                            </th>
                                        </tr>
                                    )}
                                    {s.rows.map((r) => (
                                        <tr key={r.id} className={cn('hover:bg-muted/30', TONE_ROW[toneOf(r.daysToExpiry)], ticked.has(r.id) && 'bg-primary/5')}>
                                            <td className="px-3 py-2"><Tick checked={ticked.has(r.id)} label={`Select ${r.productName}, batch ${r.batchNo}`} onChange={() => onToggle(r.id)} /></td>
                                            <td className="max-w-[16rem] px-2 py-2"><p className="truncate font-medium">{r.productName}</p>{r.manufacturer && <p className="truncate text-xs text-muted-foreground">{r.manufacturer}</p>}</td>
                                            <td className="px-2 py-2 font-mono text-xs">{r.batchNo}</td>
                                            <td className="px-2 py-2"><p className="tabular-nums">{formatDay(r.expiryDate)}</p><DaysBadge days={r.daysToExpiry} /></td>
                                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{stockText(r)}</td>
                                            <td className="px-2 py-2 text-right font-medium tabular-nums">{formatCurrency(valueOf(r))}</td>
                                            <td className="max-w-[12rem] px-2 py-2"><p className={cn('truncate', !r.distributorId && 'italic text-muted-foreground')}>{distributorText(r)}</p>{r.purchaseInvoiceNo && <p className="truncate text-xs text-muted-foreground">Inv {r.purchaseInvoiceNo}</p>}</td>
                                            <td className="px-2 py-2 text-xs text-muted-foreground">{r.rackLocation || '—'}</td>
                                        </tr>
                                    ))}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* phone: a card per batch */}
            <ul className="space-y-2 md:hidden" aria-label="Batches">
                <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                    <Tick checked={pageAll} some={pageSome} label="Select every batch on this page" onChange={() => onTogglePage(pageIds)} />
                    <span className="text-sm text-muted-foreground">Select all on this page</span>
                </li>
                {sections.map((s) => (
                    <Fragment key={s.key + (s.rows[0]?.id ?? '')}>
                        {grouped && (
                            <li className="px-1 pt-2 text-sm font-semibold">
                                {s.name}
                                {serverGroup(s.key) && <span className="ml-2 text-xs font-normal text-muted-foreground">{serverGroup(s.key)!.batches} batches</span>}
                            </li>
                        )}
                        {s.rows.map((r) => (
                            <li key={r.id} className={cn('flex gap-3 rounded-lg border bg-card p-3', TONE_ROW[toneOf(r.daysToExpiry)], ticked.has(r.id) && 'border-primary bg-primary/5')}>
                                <div className="pt-0.5"><Tick checked={ticked.has(r.id)} label={`Select ${r.productName}, batch ${r.batchNo}`} onChange={() => onToggle(r.id)} /></div>
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 break-words font-medium leading-snug">{r.productName}</p>
                                        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(valueOf(r))}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        <span className="font-mono">{r.batchNo}</span><span aria-hidden="true">·</span>
                                        <span className="tabular-nums">{formatDay(r.expiryDate)}</span><DaysBadge days={r.daysToExpiry} />
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                                        <span className="tabular-nums">{stockText(r)}</span>
                                        <span className={cn('min-w-0 truncate', !r.distributorId && 'italic')}>{distributorText(r)}</span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </Fragment>
                ))}
            </ul>
        </div>
    );
}
