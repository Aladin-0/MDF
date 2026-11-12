'use client';

import { IndianRupee, Receipt, RotateCcw, TrendingUp, Wallet } from 'lucide-react';
import { DashboardKPI } from '@/types';
import { comparisonLabel, rupees, trendOf } from '@/lib/dashboard';
import { cn } from '@/lib/utils';
import { StatCard, StatCardSkeleton } from './StatCard';

interface StatCardsRowProps {
    kpi?: DashboardKPI;
    isLoading?: boolean;
}

/**
 * Sales, bills, profit (only for people who may see purchase rates), credit given and returns, each with its change
 * against the previous period. The change is measured by the server: this row never makes a number up.
 */
export default function StatCardsRow({ kpi, isLoading }: StatCardsRowProps) {
    const showProfit = kpi?.grossProfit !== undefined && kpi?.grossProfit !== null;
    const columns = showProfit ? 'lg:grid-cols-5' : 'lg:grid-cols-4';

    if (isLoading || !kpi) {
        return (
            <div className={cn('grid grid-cols-2 gap-3', columns)}>
                {Array.from({ length: showProfit ? 5 : 4 }, (_, i) => <StatCardSkeleton key={i} />)}
            </div>
        );
    }

    const prev = kpi.previous;
    const against = comparisonLabel(kpi.previousStartDate, kpi.previousEndDate);
    const avgBill = kpi.totalBills > 0 ? kpi.totalSales / kpi.totalBills : 0;
    const returns = kpi.salesReturnAmount ?? 0;
    const owed = kpi.outstandingCredit ?? 0;

    return (
        <section aria-label="Key numbers" className={cn('grid grid-cols-2 gap-3', columns)}>
            <StatCard
                label="Sales"
                value={rupees(kpi.totalSales)}
                hint={returns > 0 ? `${rupees(kpi.netSales ?? kpi.totalSales - returns)} after returns` : `${kpi.totalBills} ${kpi.totalBills === 1 ? 'bill' : 'bills'}`}
                icon={IndianRupee}
                trend={trendOf(kpi.totalSales, prev?.totalSales)}
                trendAgainst={against}
            />
            <StatCard
                label="Bills"
                value={String(kpi.totalBills)}
                hint={kpi.totalBills > 0 ? `${rupees(avgBill)} per bill` : 'No bills yet'}
                icon={Receipt}
                trend={trendOf(kpi.totalBills, prev?.totalBills)}
                trendAgainst={against}
                href="/dashboard/sales"
            />
            {showProfit && (
                <StatCard
                    label="Gross profit"
                    value={rupees(kpi.grossProfit)}
                    hint={kpi.grossMarginPct != null ? `${kpi.grossMarginPct}% margin at landing cost` : undefined}
                    icon={TrendingUp}
                />
            )}
            <StatCard
                label="Credit given"
                value={rupees(kpi.creditGiven)}
                hint={owed > 0 ? `${rupees(owed)} owed in total` : 'Nothing owed'}
                icon={Wallet}
                trend={trendOf(kpi.creditGiven, prev?.creditGiven)}
                trendAgainst={against}
                goodWhen="down"
                href="/dashboard/credit"
            />
            <StatCard
                label="Returns"
                value={rupees(returns)}
                hint={`${kpi.salesReturnCount ?? 0} ${(kpi.salesReturnCount ?? 0) === 1 ? 'return' : 'returns'}`}
                icon={RotateCcw}
                trend={trendOf(returns, prev?.salesReturnAmount)}
                trendAgainst={against}
                goodWhen="down"
                href="/sales-returns"
                className={showProfit ? 'col-span-2 lg:col-span-1' : undefined}   // five tiles: the last one fills the phone row instead of sitting alone
            />
        </section>
    );
}
