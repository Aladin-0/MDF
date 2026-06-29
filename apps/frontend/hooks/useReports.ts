'use client';

import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, startOfWeek, endOfMonth, startOfYear, subMonths } from 'date-fns';
import { DateRangeFilter } from '@/types';
import { reportsApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';

export function getDefaultDateRange(): DateRangeFilter {
    const now = new Date();
    return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(now, 'yyyy-MM-dd'),
        period: 'this_month',
    };
}

export function getDateRangeForPeriod(period: DateRangeFilter['period']): DateRangeFilter {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');

    switch (period) {
        case 'today':
            return { from: today, to: today, period };
        case 'yesterday': {
            const yest = format(new Date(now.getTime() - 86400000), 'yyyy-MM-dd');
            return { from: yest, to: yest, period };
        }
        case 'this_week':
            return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: today, period };
        case 'last_week': {
            const lastWeekEnd = new Date(startOfWeek(now, { weekStartsOn: 1 }).getTime() - 86400000);
            const lastWeekStart = startOfWeek(lastWeekEnd, { weekStartsOn: 1 });
            return { from: format(lastWeekStart, 'yyyy-MM-dd'), to: format(lastWeekEnd, 'yyyy-MM-dd'), period };
        }
        case 'this_month':
            return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: today, period };
        case 'last_month': {
            const lastMonth = subMonths(now, 1);
            return {
                from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
                to: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
                period,
            };
        }
        case 'this_year':
            return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: today, period };
        default:
            return getDefaultDateRange();
    }
}

export function useSalesReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'sales', outletId, dateRange],
        queryFn: () => reportsApi.getSalesReport(outletId, dateRange),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useGSTReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'gst', outletId, dateRange],
        queryFn: () => reportsApi.getGSTReport(outletId, dateRange),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useStockValuation() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'stock-valuation', outletId],
        queryFn: () => reportsApi.getStockValuation(outletId),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

export function useExpiryReportData() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'expiry', outletId],
        queryFn: () => reportsApi.getExpiryReport(outletId),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

export function useStaffReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'staff', outletId, dateRange],
        queryFn: () => reportsApi.getStaffReport(outletId, dateRange),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function usePurchaseReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'purchases', outletId, dateRange],
        queryFn: () => reportsApi.getPurchaseReport(outletId, dateRange),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useBatchReport(filters: any) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'batch-wise', outletId, filters],
        queryFn: () => reportsApi.getBatchReport(outletId, filters),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}
