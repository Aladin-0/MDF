'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportSummaryCard } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

interface ReportSummaryCardsProps {
    cards: ReportSummaryCard[];
    isLoading?: boolean;
}

export function ReportSummaryCards({ cards, isLoading }: ReportSummaryCardsProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border p-4">
                        <Skeleton className="h-3 w-24 mb-3" />
                        <Skeleton className="h-7 w-32 mb-2" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cards.map((card, i) => {
                const isGoodDown = card.color === 'green';
                let TrendIcon = Minus;
                let trendColor = 'text-slate-400';

                if (card.trend === 'up') {
                    TrendIcon = TrendingUp;
                    trendColor = 'text-green-500';
                } else if (card.trend === 'down') {
                    TrendIcon = TrendingDown;
                    trendColor = isGoodDown ? 'text-green-500' : 'text-red-500';
                }

                return (
                    <div
                        key={i}
                        className="bg-white rounded-xl border p-3 sm:p-4 flex-1 min-w-0 md:min-w-[160px]"
                    >
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                            {card.label}
                        </p>
                        <p className="text-lg sm:text-2xl font-bold text-slate-900 break-words">{card.value}</p>
                        {card.change !== undefined && (
                            <div className={cn('flex items-center gap-1 mt-1', trendColor)}>
                                <TrendIcon className="w-3 h-3" />
                                <span className="text-xs">
                                    {card.change > 0 ? '+' : ''}
                                    {card.change}% {card.changeLabel ?? ''}
                                </span>
                            </div>
                        )}
                        {card.trend === 'flat' && !card.change && (
                            <div className="flex items-center gap-1 mt-1 text-slate-400">
                                <Minus className="w-3 h-3" />
                                <span className="text-xs">No change</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
