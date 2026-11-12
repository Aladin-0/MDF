import { Card } from '@/components/ui/card';
import { cn, formatQty } from '@/lib/utils';
import { formatCurrency } from '@/lib/gst';
import { daysUntil, formatDay } from '@/lib/dates';
import { expiryText } from '@/lib/inventory';
import type { ProductMetrics } from '@/lib/productDetail';

interface ProductSummaryProps {
    metrics: ProductMetrics;
    product: { packSize?: number; packType?: string; packUnit?: string; batches?: unknown[] };
    /** Purchase economics (cost value) are only for people allowed to see purchase rates. */
    showCost: boolean;
}

type Tone = 'normal' | 'bad' | 'warn';

function Stat({ label, value, sub, tone = 'normal' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone }) {
    return (
        <div className="min-w-0 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={cn('mt-0.5 truncate text-lg font-semibold leading-tight tabular-nums', tone === 'bad' && 'text-destructive', tone === 'warn' && 'text-amber-700')}>{value}</p>
            {sub && <p className={cn('truncate text-xs text-muted-foreground tabular-nums', tone === 'bad' && 'text-destructive/80', tone === 'warn' && 'text-amber-700/80')}>{sub}</p>}
        </div>
    );
}

/**
 * One strip for what used to be eight big cards (four 200px tiles and four more under them).
 * The "Loose Units" card is gone: the same number is already in "In stock".
 */
export function ProductSummary({ metrics: m, product, showCost }: ProductSummaryProps) {
    const days = m.nearestExpiry ? daysUntil(m.nearestExpiry) : null;
    const expiryTone: Tone = days === null ? 'normal' : days < 0 ? 'bad' : days <= 90 ? 'warn' : 'normal';
    const problems = m.expiredBatches + m.expiringBatches;

    return (
        <Card>
            <div role="group" aria-label="Stock summary" className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0 [&>*]:border-border">
                <Stat
                    label="In stock"
                    value={m.packs === 0 ? 'Out of stock' : formatQty(m.totalStrips, m.totalLoose, product.packSize || 1, product.packType, product.packUnit)}
                    sub={m.isLow ? `Below reorder level (${m.level})` : undefined}
                    tone={m.isLow ? 'bad' : 'normal'}
                />
                <Stat
                    label="Batches in stock"
                    value={m.inStockBatches}
                    sub={product.batches && product.batches.length > m.inStockBatches ? `${product.batches.length - m.inStockBatches} empty` : undefined}
                />
                <Stat
                    label="Expiring ≤ 90 days"
                    value={problems}
                    sub={m.expiredBatches > 0 ? `${m.expiredBatches} already expired` : problems === 0 ? 'None' : undefined}
                    tone={m.expiredBatches > 0 ? 'bad' : problems > 0 ? 'warn' : 'normal'}
                />
                <Stat
                    label="Nearest expiry"
                    value={m.nearestExpiry ? formatDay(m.nearestExpiry) : '—'}
                    sub={days !== null ? expiryText(days) : undefined}
                    tone={expiryTone}
                />
                <Stat label="MRP value" value={formatCurrency(m.mrpValue)} sub={m.packs > 0 ? `avg ${formatCurrency(m.averageMrp)} a pack` : undefined} />
                {showCost && <Stat label="Cost value" value={formatCurrency(m.costValue)} sub="at landing rate" />}
            </div>
        </Card>
    );
}
