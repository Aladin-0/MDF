'use client';

import { Users, Heart, IndianRupee, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCustomerList, useRefillAlerts } from '@/hooks/useCustomers';
import { useCreditAgingSummary } from '@/hooks/useCredit';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';

interface CustomerStatCardsProps {
    onFilterChronic?: () => void;
    onFilterOutstanding?: () => void;
    onShowRefills?: () => void;
}

export default function CustomerStatCards({ onFilterChronic, onFilterOutstanding, onShowRefills }: CustomerStatCardsProps) {
    const { data: allData } = useCustomerList();
    const { data: chronicData } = useCustomerList({ isChronic: true });
    const { data: outstandingData } = useCustomerList({ hasOutstanding: true });
    const { data: refillAlerts } = useRefillAlerts();

    const total = allData?.pagination?.totalRecords ?? allData?.data?.length ?? 0;
    const chronicCount = chronicData?.pagination?.totalRecords ?? chronicData?.data?.length ?? 0;
    const outstandingList = outstandingData?.data || [];
    const outstandingCount = outstandingData?.pagination?.totalRecords ?? outstandingList.length;
    const outstandingAmount = outstandingList.reduce((s: number, c: any) => s + (c.outstanding || 0), 0);
    const refillList = Array.isArray(refillAlerts) ? refillAlerts : (refillAlerts as any)?.data ?? [];
    const refillCount = refillList.length;
    const hasOverdue = refillList.some((a: any) => a.daysOverdue > 0);

    const cards = [
        {
            title: 'Total Customers',
            value: String(total),
            subtitle: 'Registered patients',
            onClick: undefined,
            pulse: false,
        },
        {
            title: 'Customers with Dues',
            value: String(outstandingCount),
            subtitle: 'Customers owing money',
            onClick: onFilterOutstanding,
            pulse: false,
        },
        {
            title: 'Total Outstanding',
            value: formatCurrency(outstandingAmount),
            subtitle: 'Total unpaid amount',
            onClick: onFilterOutstanding,
            pulse: false,
        },
        {
            title: 'Refills Due',
            value: String(refillCount),
            subtitle: 'Chronic refills due',
            onClick: onShowRefills,
            pulse: hasOverdue,
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
                <Card
                    key={card.title}
                    className={cn(
                        'rounded-xl p-4 cursor-pointer transition-all hover:shadow-md flex flex-col justify-center',
                        card.pulse && 'animate-pulse'
                    )}
                    onClick={card.onClick}
                >
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.title}</div>
                    <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{card.subtitle}</div>
                </Card>
            ))}
        </div>
    );
}
