import { ArrowDownRight, ArrowUpRight, Hash, IndianRupee } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatDecimalQty } from '@/lib/utils';
import { formatCount, formatInr, formatQtyNumber, type LedgerSummary } from '@/lib/stockLedger';

interface SummaryCardsProps {
    summary: LedgerSummary;
    totalRecords: number;
    /** When one batch is selected, quantities are shown as "3 strips + 4 tablets" using its pack size. */
    packSize: number | null;
    dimmed?: boolean;
}

type Tone = 'in' | 'out' | 'net-up' | 'net-down' | 'count';

const TONE: Record<Tone, { icon: string; value: string }> = {
    in:         { icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700' },
    out:        { icon: 'bg-rose-100 text-rose-700',       value: 'text-rose-700' },
    'net-up':   { icon: 'bg-primary/10 text-primary',      value: 'text-foreground' },
    'net-down': { icon: 'bg-rose-100 text-rose-700',       value: 'text-rose-700' },
    count:      { icon: 'bg-muted text-muted-foreground',  value: 'text-foreground' },
};

export function SummaryCards({ summary, totalRecords, packSize, dimmed }: SummaryCardsProps) {
    const netValue = summary.total_value_in - summary.total_value_out;
    const netQty = summary.total_in - summary.total_out;

    // Quantities are packs (a strip, a bottle...) and can be fractional. With one batch we know the pack
    // size and spell it out; across many products there is no single unit, so we say "packs".
    const qty = (n: number) => (packSize ? formatDecimalQty(n, packSize) : `${formatQtyNumber(n)} packs`);

    const cards: { label: string; value: string; sub: string; tone: Tone; icon: React.ReactNode }[] = [
        { label: 'Stock In', value: formatInr(summary.total_value_in), sub: `${qty(summary.total_in)} received`, tone: 'in', icon: <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> },
        { label: 'Stock Out', value: formatInr(summary.total_value_out), sub: `${qty(summary.total_out)} dispensed`, tone: 'out', icon: <ArrowDownRight className="h-4 w-4" aria-hidden="true" /> },
        {
            label: 'Net Change',
            value: `${netValue < 0 ? '−' : netValue > 0 ? '+' : ''}${formatInr(Math.abs(netValue))}`,
            sub: `${netQty < 0 ? '−' : netQty > 0 ? '+' : ''}${qty(Math.abs(netQty))} in this period`,
            tone: netValue < 0 ? 'net-down' : 'net-up',
            icon: <IndianRupee className="h-4 w-4" aria-hidden="true" />,
        },
        { label: 'Transactions', value: formatCount(totalRecords), sub: 'matching your filters', tone: 'count', icon: <Hash className="h-4 w-4" aria-hidden="true" /> },
    ];

    return (
        <div role="group" aria-label="Summary for the selected period" className={cn('grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-4', dimmed && 'opacity-60')}>
            {cards.map((c) => (
                <Card key={c.label}>
                    <CardContent className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                            <p className={cn('mt-1.5 truncate text-2xl font-semibold tabular-nums', TONE[c.tone].value)}>{c.value}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{c.sub}</p>
                        </div>
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE[c.tone].icon)}>{c.icon}</span>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
