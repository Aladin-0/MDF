'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Inbox, Package, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDecimalQty } from '@/lib/utils';
import { LOW_STOCK_PACKS, formatCount, type BatchSummaryItem } from '@/lib/stockLedger';

/** Render this many at a time. An outlet can have thousands of batches; painting them all froze typing in the search box. */
const PAGE = 50;

interface BatchPanelProps {
    batches: BatchSummaryItem[];
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    selectedId: string | null;
    onSelect: (batchId: string | null) => void;
}

function StockBadge({ qty }: { qty: number }) {
    if (qty <= 0) return <Badge variant="secondary" className="px-2 py-0 text-[11px]">Out</Badge>;
    if (qty <= LOW_STOCK_PACKS) {
        return <Badge variant="outline" className="border-amber-200 bg-amber-50 px-2 py-0 text-[11px] text-amber-800">Low</Badge>;
    }
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 px-2 py-0 text-[11px] text-emerald-800">In Stock</Badge>;
}

export function BatchPanel({ batches, loading, error, onRetry, selectedId, onSelect }: BatchPanelProps) {
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(PAGE);
    const deferred = useDeferredValue(search);

    const filtered = useMemo(() => {
        const s = deferred.trim().toLowerCase();
        if (!s) return batches;
        return batches.filter((b) => b.batch_number.toLowerCase().includes(s) || b.product_name.toLowerCase().includes(s));
    }, [batches, deferred]);

    const visible = filtered.slice(0, limit);

    return (
        <section aria-labelledby="batch-panel-title" className="flex h-full min-h-0 flex-col">
            <div className="space-y-3 border-b p-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 id="batch-panel-title" className="flex items-center gap-2 text-sm font-semibold">
                        <Package className="h-4 w-4 text-primary" aria-hidden="true" />
                        Batches
                    </h2>
                    <Badge variant="secondary" className="tabular-nums">{formatCount(batches.length)}</Badge>
                </div>
                <div className="relative">
                    <Label htmlFor="batch-search" className="sr-only">Search batches by product or batch number</Label>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                        id="batch-search"
                        name="batch-search"
                        type="search"
                        autoComplete="off"
                        spellCheck={false}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
                        placeholder="Product or batch no.…"
                        className="pl-9"
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <button
                    type="button"
                    onClick={() => onSelect(null)}
                    aria-pressed={!selectedId}
                    className={cn(
                        'w-full border-l-4 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        !selectedId ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/60',
                    )}
                >
                    <span className="block text-sm font-semibold">All Batches</span>
                    <span className="block text-xs text-muted-foreground">Movements across every product</span>
                </button>

                {loading ? (
                    <div className="space-y-3 p-4" role="status" aria-label="Loading batches">
                        {Array.from({ length: 6 }, (_, i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/3" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                        <p className="flex items-center gap-2 font-medium text-destructive">
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Couldn&apos;t load batches
                        </p>
                        <p className="mt-1 text-muted-foreground">{error}</p>
                        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>Try Again</Button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-4 py-12 text-center text-muted-foreground">
                        <Inbox className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                        <p className="text-sm">{search ? 'No batches match your search' : 'No batches yet'}</p>
                    </div>
                ) : (
                    <ul className="divide-y">
                        {visible.map((b) => {
                            const selected = selectedId === b.batch_id;
                            return (
                                <li key={b.batch_id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(selected ? null : b.batch_id)}
                                        aria-pressed={selected}
                                        className={cn(
                                            'w-full border-l-4 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                                            selected ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/60',
                                        )}
                                    >
                                        <span className="flex items-start justify-between gap-2">
                                            <span className="line-clamp-2 min-w-0 break-words text-sm font-medium leading-snug">{b.product_name}</span>
                                            <ChevronRight
                                                className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', selected && 'rotate-90 text-primary')}
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <span translate="no" className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                            {b.batch_number}
                                        </span>
                                        <span className="mt-2 flex items-center justify-between gap-2">
                                            <span className={cn('text-xs font-medium tabular-nums', b.qty_remaining > 0 ? 'text-emerald-700' : 'text-muted-foreground')}>
                                                {formatDecimalQty(b.qty_remaining, b.pack_size)} left
                                            </span>
                                            <StockBadge qty={b.qty_remaining} />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {!loading && !error && filtered.length > visible.length && (
                    <div className="border-t p-3 text-center">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                            Show {Math.min(PAGE, filtered.length - visible.length)} More ({formatCount(filtered.length - visible.length)} Hidden)
                        </Button>
                    </div>
                )}
            </div>
        </section>
    );
}
