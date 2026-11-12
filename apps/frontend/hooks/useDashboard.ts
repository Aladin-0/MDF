'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { dashboardApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { DateRangeFilter } from '@/types';

/**
 * The home dashboard: KPIs, charts, tables and stock alerts all come from ONE request (the alerts used to have a
 * second hook on the same key). While a new period loads, the previous one stays on screen (`isPlaceholderData`) so
 * the page keeps its shape instead of blinking back to skeletons.
 */
export function useDashboardKPI(dateRange?: DateRangeFilter) {
    const outletId = useOutletId();
    const today = format(new Date(), 'yyyy-MM-dd');
    const startDate = dateRange?.from || today;
    const endDate = dateRange?.to || today;

    return useQuery({
        queryKey: ['dashboard', 'kpi', outletId, startDate, endDate],
        queryFn: () => dashboardApi.getDailySummary(outletId, today, startDate, endDate),
        enabled: !!outletId,
        placeholderData: keepPreviousData,
        staleTime: 1000 * 60 * 2,
        refetchInterval: 1000 * 60 * 2,      // pauses while the tab is hidden (React Query's default)
    });
}
