'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/reports/DateRangePicker';
import { useAuthStore } from '@/store/authStore';
import { useOutletName } from '@/hooks/useOutletName';
import { greetingFor, periodTitle } from '@/lib/dashboard';
import { DateRangeFilter } from '@/types';

interface DashboardHeaderProps {
    isFetching?: boolean;
    onRefresh?: () => void;
    /** When the numbers on screen were last fetched (ms), so the page can say how fresh they are. */
    updatedAt?: number;
    dateRange: DateRangeFilter;
    onDateRangeChange: (range: DateRangeFilter) => void;
}

export default function DashboardHeader({ isFetching, onRefresh, updatedAt, dateRange, onDateRangeChange }: DashboardHeaderProps) {
    const user = useAuthStore((s) => s.user);
    const outletName = useOutletName();
    // The greeting depends on the visitor's clock, so it is set after mount (a server-rendered one could disagree with it).
    const [greeting, setGreeting] = useState('Welcome');
    useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

    const firstName = user?.name?.split(' ')[0];
    const period = periodTitle(dateRange.from, dateRange.to);

    return (
        <header className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance]">
                        {greeting}{firstName ? `, ${firstName}` : ''}
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {outletName ? <>{outletName} <span aria-hidden="true">·</span> </> : null}
                        <span className="font-medium text-foreground">{period}</span>
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {updatedAt ? (
                        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline" aria-live="polite">
                            Updated {format(updatedAt, 'h:mm a')}
                        </span>
                    ) : null}
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onRefresh}
                        disabled={isFetching}
                        aria-label={isFetching ? 'Updating dashboard' : 'Refresh dashboard'}
                        title="Refresh"
                    >
                        <RefreshCw className={isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" />
                    </Button>
                </div>
            </div>

            <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </header>
    );
}
