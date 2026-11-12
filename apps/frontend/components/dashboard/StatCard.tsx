'use client';

import Link from 'next/link';
import { LucideIcon, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Trend } from '@/lib/dashboard';

export interface StatCardProps {
    label: string;
    value: string;
    /** One line under the value. */
    hint?: string;
    icon: LucideIcon;
    /** Change against the previous period; null/undefined when there is nothing to compare with. */
    trend?: Trend | null;
    /** What the trend is compared with ("yesterday"), for the tooltip and screen readers. */
    trendAgainst?: string;
    /** Whether a rise is good news. Returns and credit are the other way round. */
    goodWhen?: 'up' | 'down';
    href?: string;
    className?: string;
}

export function StatCardSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-4" role="status" aria-label="Loading">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
        </div>
    );
}

function TrendChip({ trend, against, goodWhen }: { trend: Trend; against?: string; goodWhen: 'up' | 'down' }) {
    const good = trend.direction === 'flat' ? null : (trend.direction === goodWhen);
    const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
    const text = trend.direction === 'flat' ? 'No change' : `${trend.direction === 'up' ? '+' : '−'}${Math.abs(trend.pct)}%`;
    return (
        <span
            title={against ? `Compared with ${against}` : undefined}
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                good === null && 'bg-muted text-muted-foreground',
                good === true && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                good === false && 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
            )}
        >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {text}
            <span className="sr-only">{against ? ` compared with ${against}` : ''}</span>
        </span>
    );
}

export function StatCard({ label, value, hint, icon: Icon, trend, trendAgainst, goodWhen = 'up', href, className }: StatCardProps) {
    const body = (
        <>
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
                {trend ? <TrendChip trend={trend} against={trendAgainst} goodWhen={goodWhen} /> : null}
            </div>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </>
    );

    const base = cn('block rounded-xl border bg-card p-4', className);
    if (href) {
        return (
            <Link href={href} className={cn(base, 'transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
                {body}
            </Link>
        );
    }
    return <div className={base}>{body}</div>;
}
