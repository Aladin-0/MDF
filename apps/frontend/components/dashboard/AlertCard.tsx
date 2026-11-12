'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface AlertItem {
    key: string;
    label: string;
    sublabel: string;
    /** A short status the row ends with ("Expired 10d ago"). It is words, never a colour alone. */
    status: string;
    tone: 'danger' | 'warning';
    href?: string;
}

export interface AlertCardProps {
    title: string;
    /** The true total, which may be more than the rows shown. */
    count: number;
    /** One line under the title when something needs attention. */
    summary: string;
    icon: LucideIcon;
    items: AlertItem[];
    allClear: string;
    viewAllLabel: string;
    viewAllHref: string;
}

const TONE = {
    danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
};

export function AlertCardSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-4" role="status" aria-label="Loading alerts">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
    );
}

export function AlertCard({ title, count, summary, icon: Icon, items, allClear, viewAllLabel, viewAllHref }: AlertCardProps) {
    if (count === 0) {
        return (
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="text-sm text-muted-foreground">{allClear}</p>
                </div>
            </div>
        );
    }

    return (
        <section className="rounded-xl border bg-card p-4" aria-label={title}>
            <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    {title}
                </h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>
            </div>

            <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>

            <ul className="mt-2 divide-y">
                {items.slice(0, 3).map((item) => {
                    const row = (
                        <>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{item.label}</span>
                                <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>
                            </span>
                            <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONE[item.tone])}>{item.status}</span>
                        </>
                    );
                    return (
                        <li key={item.key}>
                            {item.href ? (
                                <Link href={item.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{row}</Link>
                            ) : (
                                <div className="-mx-2 flex items-center gap-3 px-2 py-2">{row}</div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <Link href={viewAllHref} className="mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {viewAllLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
        </section>
    );
}
