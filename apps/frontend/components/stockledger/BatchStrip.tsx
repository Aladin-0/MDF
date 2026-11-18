'use client';

import { expiryDayText, packsText, type BatchCard } from '@/lib/stockLedger';
import { formatMonth } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Props {
    product: { name: string; manufacturer: string; batches: BatchCard[] };
    selectedBatch: string | null;
    onSelect: (batchId: string | null) => void;
}

const STATE_BADGE: Record<string, string> = {
    sold_out: 'bg-muted text-muted-foreground',
    expired: 'bg-red-600 text-white',
    expiring: 'bg-amber-100 text-amber-900',
    ok: 'bg-emerald-50 text-emerald-800',
};
const STATE_LABEL: Record<string, string> = { sold_out: 'Sold out', expired: 'Expired', expiring: 'Expiring', ok: 'In stock' };

/** A product's batches as cards, soonest expiry first, sold-out ones last: pick one to see only its history. */
export function BatchStrip({ product, selectedBatch, onSelect }: Props) {
    const stocked = product.batches.filter((b) => b.qty_units > 0);
    const totalPacks = stocked.reduce((n, b) => n + b.qty_packs, 0);
    const first = product.batches[0];
    return (
        <section aria-label={`Batches of ${product.name}`} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{product.name}</h2>
                    <p className="text-xs text-muted-foreground">{product.manufacturer && `${product.manufacturer} · `}{product.batches.length} {product.batches.length === 1 ? 'batch' : 'batches'}, {stocked.length} in stock{first && stocked.length > 0 ? ` · ${packsText(totalPacks, first)} in all` : ''}</p>
                </div>
                <button type="button" onClick={() => onSelect(null)} aria-pressed={!selectedBatch}
                    className={cn('h-9 rounded-full border px-3.5 text-sm font-medium', !selectedBatch ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
                    All batches
                </button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {product.batches.map((b) => {
                    const on = selectedBatch === b.id;
                    return (
                        <li key={b.id}>
                            <button type="button" onClick={() => onSelect(on ? null : b.id)} aria-pressed={on}
                                className={cn('w-full space-y-1.5 rounded-lg border p-3 text-left transition-colors', on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/50', b.state === 'sold_out' && !on && 'opacity-75')}>
                                <div className="flex items-start justify-between gap-2">
                                    <span translate="no" className="break-all font-mono text-sm font-semibold">{b.batch_number}</span>
                                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', STATE_BADGE[b.state])}>{STATE_LABEL[b.state]}</span>
                                </div>
                                <p className="text-xs text-muted-foreground tabular-nums">Exp {formatMonth(b.expiry_date)} · {expiryDayText(b.days_to_expiry)}</p>
                                <p className="text-sm font-medium tabular-nums">{b.qty_units > 0 ? packsText(b.qty_packs, b) : 'Nothing left'}</p>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
