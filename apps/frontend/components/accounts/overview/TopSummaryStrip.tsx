'use client';

import { useDashboardKPIs } from '@/hooks/useAccounts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Wallet, Building2, User, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface KPICardProps {
    title: string;
    amount: number;
    icon: React.ElementType;
    trend?: 'up' | 'down' | 'neutral';
    trendAmount?: number;
    colorScheme: 'red' | 'green' | 'blue' | 'amber';
    isLoading: boolean;
}

function KPICard({ title, amount, icon: Icon, trend, trendAmount, colorScheme, isLoading }: KPICardProps) {
    const colors = {
        red: 'bg-red-50 text-red-600',
        green: 'bg-emerald-50 text-emerald-600',
        blue: 'bg-blue-50 text-blue-600',
        amber: 'bg-amber-50 text-amber-600',
    };

    return (
        <Card>
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', colors[colorScheme])}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
                {isLoading ? (
                    <Skeleton className="h-8 w-3/4" />
                ) : (
                    <div>
                        <p className="text-2xl font-bold tracking-tight">{formatINR(amount)}</p>
                        {trend && trendAmount !== undefined && (
                            <div className="flex items-center gap-1 mt-1 text-xs">
                                {trend === 'up' && <TrendingUp className="h-3 w-3 text-red-500" />}
                                {trend === 'down' && <TrendingDown className="h-3 w-3 text-emerald-500" />}
                                <span className={cn(
                                    trend === 'up' ? 'text-red-600' : trend === 'down' ? 'text-emerald-600' : 'text-muted-foreground'
                                )}>
                                    {formatINR(trendAmount)} overdue
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function TopSummaryStrip() {
    const { data, isLoading } = useDashboardKPIs();

    const kpis = data || {
        totalPayable: 0,
        overduePayable: 0,
        totalReceivable: 0,
        overdueReceivable: 0,
        netPosition: 0,
        cashBalance: 0,
        bankBalance: 0,
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
                title="Total Payable (You Owe)"
                amount={kpis.totalPayable}
                icon={Building2}
                trend={kpis.overduePayable > 0 ? 'up' : undefined}
                trendAmount={kpis.overduePayable}
                colorScheme="red"
                isLoading={isLoading}
            />
            <KPICard
                title="Total Receivable (Owed to You)"
                amount={kpis.totalReceivable}
                icon={User}
                trend={kpis.overdueReceivable > 0 ? 'down' : undefined}
                trendAmount={kpis.overdueReceivable}
                colorScheme="green"
                isLoading={isLoading}
            />
            <KPICard
                title="Net Position"
                amount={kpis.netPosition}
                icon={Wallet}
                colorScheme={kpis.netPosition >= 0 ? 'green' : 'red'}
                isLoading={isLoading}
            />
            <KPICard
                title="Cash & Bank Balance"
                amount={kpis.cashBalance + kpis.bankBalance}
                icon={Landmark}
                colorScheme="blue"
                isLoading={isLoading}
            />
        </div>
    );
}
