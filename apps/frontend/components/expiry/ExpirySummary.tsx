import { formatCurrency } from '@/lib/gst';
import { UNKNOWN_DISTRIBUTOR, type ExpiryGroup, type ExpiryTotals } from '@/lib/expiryManager';
import { cn } from '@/lib/utils';

const count = new Intl.NumberFormat('en-IN');

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
    return (
        <div className="min-w-0 px-3 py-2.5 sm:px-4">
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>
            <dd className={cn('truncate text-lg font-semibold tabular-nums', tone === 'red' && 'text-red-700')}>{value}</dd>
        </div>
    );
}

interface Props {
    totals?: ExpiryTotals;
    groups: ExpiryGroup[];
    /** distributor ids currently chosen in the filter (a chip click adds/removes one) */
    chosen: string[];
    onPick: (id: string) => void;
    loading?: boolean;
}

/** ONE summary strip (like the product page), then a chip per distributor with its count: tap to narrow to it. */
export function ExpirySummary({ totals, groups, chosen, onPick, loading }: Props) {
    return (
        <div className="space-y-2">
            <dl className={cn('grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6', loading && 'opacity-60')} aria-busy={loading}>
                <Stat label="Batches" value={totals ? count.format(totals.batches) : '…'} />
                <Stat label="Products" value={totals ? count.format(totals.products) : '…'} />
                <Stat label="Already expired" value={totals ? count.format(totals.expiredBatches) : '…'} tone={totals && totals.expiredBatches > 0 ? 'red' : undefined} />
                <Stat label="Cost at risk" value={totals ? (totals.costValue === undefined ? 'Hidden' : formatCurrency(totals.costValue)) : '…'} />
                <Stat label="MRP value" value={totals ? formatCurrency(totals.mrpValue) : '…'} />
                <Stat label="Distributors" value={totals ? count.format(totals.distributors) : '…'} />
            </dl>
            {groups.length > 1 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar sm:flex-wrap" role="group" aria-label="Distributors in this list">
                    {groups.map((g) => {
                        const id = g.distributorId ?? UNKNOWN_DISTRIBUTOR;
                        const on = chosen.includes(id);
                        return (
                            <button key={id} type="button" aria-pressed={on} onClick={() => onPick(id)}
                                className={cn('flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-colors', on ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-muted')}>
                                <span className={cn('max-w-[11rem] truncate', !g.distributorId && 'italic')}>{g.name}</span>
                                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{g.batches}</span>
                                <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">{formatCurrency(g.costValue ?? g.mrpValue)}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
