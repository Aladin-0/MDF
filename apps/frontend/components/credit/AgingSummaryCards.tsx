'use client';

import { IndianRupee, Clock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCreditAgingSummary } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface AgingSummaryCardsProps {
    onBucketClick?: (bucket: string) => void;
    activeBucket?: string;
}

export default function AgingSummaryCards({ onBucketClick, activeBucket }: AgingSummaryCardsProps) {
    const { data: aging, isLoading } = useCreditAgingSummary();

    if (isLoading) {
        return (
            <div className="flex gap-3 overflow-x-auto pb-2">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="min-w-[160px] h-[120px] rounded-xl" />
                ))}
            </div>
        );
    }

    if (!aging) return null;

    const cards = [
        {
            key: 'all',
            title: 'Total Outstanding',
            value: typeof aging.totalOutstanding === 'number' ? aging.totalOutstanding : (aging.totalOutstanding as any).amount,
            count: typeof aging.totalOutstanding === 'number' ? undefined : (aging.totalOutstanding as any).count,
            icon: IndianRupee,
            className: 'bg-slate-900 text-white',
            iconBg: 'bg-white/10',
            iconColor: 'text-white',
            valueColor: 'text-white',
        },
        {
            key: 'current',
            title: 'Current',
            subtitle: '0–30 days',
            value: aging.current.amount,
            count: aging.current.count,
            icon: Clock,
            className: 'bg-blue-50 border-l-4 border-l-blue-500',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-500',
            valueColor: 'text-blue-700',
        },
        {
            key: '30-60',
            title: 'Overdue',
            subtitle: '31–60 days',
            value: aging.days30to60.amount,
            count: aging.days30to60.count,
            icon: AlertTriangle,
            className: 'bg-amber-50 border-l-4 border-l-amber-500',
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-500',
            valueColor: 'text-amber-700',
        },
        {
            key: '60-90',
            title: 'Overdue',
            subtitle: '61–90 days',
            value: aging.days60to90.amount,
            count: aging.days60to90.count,
            icon: AlertTriangle,
            className: 'bg-orange-50 border-l-4 border-l-orange-500',
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-500',
            valueColor: 'text-orange-700',
        },
        {
            key: 'over90',
            title: 'Critical',
            subtitle: '90+ days',
            value: aging.over90.amount,
            count: aging.over90.count,
            icon: ShieldAlert,
            className: cn(
                'bg-red-50 border-l-4 border-l-red-600',
                aging.over90.amount > 0 && 'animate-pulse'
            ),
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            valueColor: 'text-red-700',
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-3 sm:flex sm:overflow-x-auto sm:pb-2">
            {cards.map((card) => {
                const Icon = card.icon;
                const isActive = activeBucket === card.key;
                return (
                    <Card
                        key={card.key}
                        className={cn(
                            'min-w-0 sm:min-w-[160px] rounded-xl p-3 sm:p-4 cursor-pointer transition-all hover:shadow-md',
                            card.key === 'all' && 'col-span-2 sm:col-span-1',
                            card.className,
                            isActive && 'ring-2 ring-primary ring-offset-2'
                        )}
                        onClick={() => onBucketClick?.(card.key)}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', card.iconBg)}>
                                <Icon className={cn('w-4 h-4', card.iconColor)} />
                            </div>
                        </div>
                        <div className={cn('text-xs font-medium opacity-80', card.key === 'all' ? 'text-white/70' : 'text-muted-foreground')}>
                            {card.title}
                            {card.subtitle && <span className="ml-1">· {card.subtitle}</span>}
                        </div>
                        <div className={cn('text-xl sm:text-2xl font-bold mt-1 max-sm:break-words', card.valueColor)}>
                            {formatCurrency(card.value)}
                        </div>
                        <div className={cn('text-xs mt-1', card.key === 'all' ? 'text-white/60' : 'text-muted-foreground')}>
                            {card.count} {card.count === 1 ? 'account' : 'accounts'}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
