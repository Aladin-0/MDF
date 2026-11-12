'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { DateRangeFilter } from '@/types';
import { useDashboardKPI } from '@/hooks/useDashboard';
import { apiErrorMessage } from '@/lib/apiError';
import { periodTitle } from '@/lib/dashboard';
import { cn } from '@/lib/utils';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import StatCardsRow from '@/components/dashboard/StatCardsRow';
import AlertsRow from '@/components/dashboard/AlertsRow';
import PaymentMixCard from '@/components/dashboard/PaymentMixCard';
import TopSellingTable from '@/components/dashboard/TopSellingTable';
import StaffLeaderboard from '@/components/dashboard/StaffLeaderboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// recharts is large and only this page uses it: load it after the first paint
const HourlySalesChart = dynamic(() => import('@/components/dashboard/HourlySalesChart'), {
    ssr: false,
    loading: () => <Skeleton className="h-56 w-full" role="status" aria-label="Loading chart" />,
});

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState<DateRangeFilter>(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return { from: today, to: today, period: 'today' };
    });

    const { data: kpi, isLoading, isFetching, isError, error, isPlaceholderData, dataUpdatedAt, refetch } = useDashboardKPI(dateRange);
    const period = periodTitle(dateRange.from, dateRange.to);
    const multiDay = dateRange.from !== dateRange.to;

    return (
        <div className="max-w-[1400px] space-y-4">
            <DashboardHeader
                isFetching={isFetching}
                onRefresh={() => refetch()}
                updatedAt={dataUpdatedAt || undefined}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
            />

            {/* a failed load says so and offers a retry; numbers already on screen stay (they are the last good ones) */}
            {isError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>{kpi ? 'Couldn’t refresh the dashboard' : 'Couldn’t load the dashboard'}</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(error, 'Something went wrong.')}{kpi ? ' These are the last numbers we had.' : ''}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* dimmed only while the previous period stands in for the one just chosen */}
            <div className={cn('space-y-4 transition-opacity', isPlaceholderData && 'opacity-60')} aria-busy={isFetching}>
                <StatCardsRow kpi={kpi} isLoading={isLoading} />

                <AlertsRow alerts={kpi?.alerts} isLoading={isLoading} />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <Card className="min-w-0 lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Sales by hour</CardTitle>
                            <CardDescription>{period}{multiDay ? ' · all days added together' : ''}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <HourlySalesChart data={kpi?.hourlySales ?? []} isLoading={isLoading} />
                        </CardContent>
                    </Card>
                    <div className="min-w-0">
                        <PaymentMixCard kpi={kpi} isLoading={isLoading} periodLabel={period} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="min-w-0 lg:col-span-2">
                        <TopSellingTable items={kpi?.topSellingItems ?? []} totalSales={kpi?.totalSales ?? 0} isLoading={isLoading} periodLabel={period} />
                    </div>
                    <div className="min-w-0">
                        <StaffLeaderboard
                            leaderboard={(kpi?.staffLeaderboard ?? []).map((s) => ({
                                id: s.id ?? s.staffId ?? '',
                                name: s.name,
                                role: s.role ?? 'billing_staff',
                                totalSales: s.totalSales,
                                billsCount: s.billsCount,
                            }))}
                            isLoading={isLoading}
                            periodLabel={period}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
