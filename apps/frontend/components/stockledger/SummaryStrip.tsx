import { formatCount, formatInr, packsText, type LedgerSummary, type PackInfo } from '@/lib/stockLedger';
import { cn } from '@/lib/utils';

interface Props {
    summary: LedgerSummary;
    movements: number;
    /** the pack to speak in when ONE batch is shown; across many products there is no single unit, so it says "packs" */
    pack: PackInfo | null;
    showValues: boolean;
    dimmed?: boolean;
}

/** What moved in the period, as counts in the batch's own words. Money only when asked for (and allowed). */
export function SummaryStrip({ summary, movements, pack, showValues, dimmed }: Props) {
    const qty = (n: number) => (pack ? packsText(n, pack) : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)} packs`);
    const cells = [
        { label: 'Received', value: summary.received, note: summary.customer_returns > 0 ? `+ ${qty(summary.customer_returns)} customer returns` : '', tone: 'text-emerald-700' },
        { label: 'Sold', value: summary.sold, note: '', tone: 'text-rose-700' },
        { label: 'Written off', value: summary.written_off, note: summary.supplier_returns > 0 ? `+ ${qty(summary.supplier_returns)} returned to suppliers` : '', tone: 'text-amber-700' },
    ];
    return (
        <dl aria-label="Summary for the selected period" className={cn('grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card transition-opacity sm:grid-cols-4 sm:divide-y-0', dimmed && 'opacity-60')}>
            {cells.map((c) => (
                <div key={c.label} className="min-w-0 px-3 py-2.5 sm:px-4">
                    <dt className="text-xs text-muted-foreground">{c.label}</dt>
                    <dd className={cn('truncate text-lg font-semibold tabular-nums', c.value > 0 && c.tone)}>{c.value > 0 ? qty(c.value) : '0'}</dd>
                    {c.note && <p className="truncate text-xs text-muted-foreground tabular-nums">{c.note}</p>}
                    {showValues && c.label === 'Received' && summary.total_value_in !== null && <p className="text-xs text-muted-foreground tabular-nums">at cost {formatInr(summary.total_value_in)}</p>}
                    {showValues && c.label === 'Sold' && summary.total_value_out !== null && <p className="text-xs text-muted-foreground tabular-nums">out at cost {formatInr(summary.total_value_out)}</p>}
                </div>
            ))}
            <div className="min-w-0 px-3 py-2.5 sm:px-4">
                <dt className="text-xs text-muted-foreground">Movements</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatCount(movements)}</dd>
                <p className="text-xs text-muted-foreground">matching your filters</p>
            </div>
        </dl>
    );
}
