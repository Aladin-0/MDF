'use client';

import { DashboardKPI } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { percentOf, rupees } from '@/lib/dashboard';

interface PaymentMixCardProps {
    kpi?: DashboardKPI;
    isLoading?: boolean;
    periodLabel: string;
}

// Fixed order, one colour per way of paying (theme tokens --viz-1..4, validated light and dark).
const MODES = [
    { key: 'cash', label: 'Cash', color: 'var(--viz-1)' },
    { key: 'upi', label: 'UPI', color: 'var(--viz-2)' },
    { key: 'card', label: 'Card', color: 'var(--viz-3)' },
    { key: 'credit', label: 'Credit', color: 'var(--viz-4)' },
] as const;

/**
 * How the period's sales were paid: cash + UPI + card + credit adds up to the billed total (the server takes it
 * from the invoices). A bar for the shape, the figures beside it for the exact amounts: colour is never the only cue.
 */
export default function PaymentMixCard({ kpi, isLoading, periodLabel }: PaymentMixCardProps) {
    const rows = MODES.map((m) => ({ ...m, amount: kpi?.paymentBreakdown?.[m.key] ?? 0 }));
    const total = rows.reduce((sum, r) => sum + r.amount, 0);

    return (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Payments</CardTitle>
                <CardDescription>{periodLabel} · how sales were paid</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading || !kpi ? (
                    <div className="space-y-3" role="status" aria-label="Loading payments">
                        <Skeleton className="h-3 w-full" />
                        {MODES.map((m) => <Skeleton key={m.key} className="h-5 w-full" />)}
                    </div>
                ) : total === 0 ? (
                    <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No sales in this period</p>
                ) : (
                    <>
                        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" role="img"
                            aria-label={rows.filter((r) => r.amount > 0).map((r) => `${r.label} ${percentOf(r.amount, total)}%`).join(', ')}>
                            {rows.filter((r) => r.amount > 0).map((r) => (
                                <span key={r.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(r.amount / total) * 100}%`, backgroundColor: r.color }} />
                            ))}
                        </div>
                        <ul className="space-y-2">
                            {rows.map((r) => (
                                <li key={r.key} className="flex items-center gap-2 text-sm">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />
                                    <span className="flex-1">{r.label}</span>
                                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{percentOf(r.amount, total)}%</span>
                                    <span className="w-24 text-right font-medium tabular-nums">{rupees(r.amount)}</span>
                                </li>
                            ))}
                        </ul>
                        <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                            <div>
                                <dt className="text-xs text-muted-foreground">Discount given</dt>
                                <dd className="font-medium tabular-nums">{rupees(kpi.totalDiscount)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">GST in sales</dt>
                                <dd className="font-medium tabular-nums">{rupees(kpi.totalGst)}</dd>
                            </div>
                        </dl>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
