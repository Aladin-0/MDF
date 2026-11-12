'use client';

import { AlertTriangle, IndianRupee, Package, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/gst';
import { useInventorySummary } from '@/hooks/useInventorySummary';
import { useInventoryStore } from '@/store/inventoryStore';
import { VALUATION_LABELS } from '@/lib/inventory';
import { ValuationToggle } from '@/components/inventory/ValuationToggle';
import type { InventoryTab } from '@/lib/inventoryParams';

const count = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

interface CardProps {
    title: string;
    icon: React.ReactNode;
    tone: string;
    loading: boolean;
    error: boolean;
    onRetry: () => void;
    value: string;
    subtitle: React.ReactNode;
    footer?: React.ReactNode;
    /** Makes the whole card a real button (keyboard and screen-reader friendly), not a clickable div. */
    onSelect?: () => void;
    selectLabel?: string;
}

function StatCard({ title, icon, tone, loading, error, onRetry, value, subtitle, footer, onSelect, selectLabel }: CardProps) {
    const body = (
        <div className="flex items-start gap-4">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', tone)} aria-hidden="true">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                {loading ? (
                    <div className="mt-2 space-y-2" role="status" aria-label={`Loading ${title}`}>
                        <Skeleton className="h-7 w-28" />
                        <Skeleton className="h-4 w-36" />
                    </div>
                ) : error ? (
                    // a failed load must never look like a real zero
                    <p className="mt-1 text-sm text-destructive">Couldn&apos;t load this figure.</p>
                ) : (
                    <>
                        <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
                    </>
                )}
            </div>
        </div>
    );

    const shell = 'rounded-xl border bg-card text-card-foreground shadow-sm';
    return (
        <div className={cn(shell, 'flex flex-col')}>
            {onSelect && !error ? (
                <button
                    type="button"
                    onClick={onSelect}
                    aria-label={selectLabel}
                    className="w-full flex-1 rounded-xl p-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {body}
                </button>
            ) : (
                <div className="flex-1 p-5">{body}</div>
            )}
            {error && (
                <div className="px-5 pb-4"><Button type="button" size="sm" variant="outline" onClick={onRetry}>Try Again</Button></div>
            )}
            {footer && <div className="border-t px-5 py-3">{footer}</div>}
        </div>
    );
}

export function InventoryStatCards({ onTabChange }: { onTabChange?: (tab: InventoryTab) => void }) {
    const { total, expiring, lowStock, valuation, counts } = useInventorySummary();
    const { valuationMode, setValuationMode } = useInventoryStore();

    const data = valuation.data?.data;
    const stockValue =
        valuationMode === 'PURCHASE' ? data?.total_value_purchase ?? data?.totalValuation ?? 0
        : valuationMode === 'LANDING' ? data?.total_value_landing ?? 0
        : data?.total_value_mrp ?? 0;
    const activeBatches: number | undefined = data?.activeBatches;

    return (
        <section aria-label="Inventory summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
                title="Products in Stock"
                icon={<Package className="h-5 w-5" />}
                tone="bg-primary/10 text-primary"
                loading={total.isLoading}
                error={total.isError}
                onRetry={() => total.refetch()}
                value={count.format(counts.total)}
                subtitle={activeBatches !== undefined ? `${count.format(activeBatches)} active batches` : 'Across all batches'}
            />
            <StatCard
                title="Stock Value"
                icon={<IndianRupee className="h-5 w-5" />}
                tone="bg-emerald-100 text-emerald-700"
                loading={valuation.isLoading}
                error={valuation.isError}
                onRetry={() => valuation.refetch()}
                value={formatCurrency(stockValue)}
                subtitle={`At ${VALUATION_LABELS[valuationMode]} ${valuationMode === 'MRP' ? '' : 'price'}`.trim()}
                footer={<ValuationToggle value={valuationMode} onChange={setValuationMode} />}
            />
            <StatCard
                title="Expiring Soon"
                icon={<AlertTriangle className="h-5 w-5" />}
                tone="bg-amber-100 text-amber-700"
                loading={expiring.isLoading}
                error={expiring.isError}
                onRetry={() => expiring.refetch()}
                value={`${count.format(counts.expiring)} ${counts.expiring === 1 ? 'product' : 'products'}`}
                subtitle="Within 90 days, including expired"
                onSelect={() => onTabChange?.('expiring')}
                selectLabel={`Expiring soon: ${counts.expiring} products. Open the list.`}
            />
            <StatCard
                title="Low Stock"
                icon={<PackageX className="h-5 w-5" />}
                tone="bg-red-100 text-red-700"
                loading={lowStock.isLoading}
                error={lowStock.isError}
                onRetry={() => lowStock.refetch()}
                value={`${count.format(counts.lowStock)} ${counts.lowStock === 1 ? 'product' : 'products'}`}
                subtitle="Below the reorder level"
                onSelect={() => onTabChange?.('low_stock')}
                selectLabel={`Low stock: ${counts.lowStock} products. Open the list.`}
            />
        </section>
    );
}
