'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
        queryFn: async () => {
            const res = await reportsApi.getSalesReport(outletId, dateRange);
            const rows = (res?.rows || []).map((r: any) => ({
                ...r,
                netSales: r.netSales ?? r.totalSales ?? 0,
                cashSales: r.cashSales ?? r.paymentBreakdown?.cash ?? 0,
                upiSales: r.upiSales ?? r.paymentBreakdown?.upi ?? 0,
                cardSales: r.cardSales ?? r.paymentBreakdown?.card ?? 0,
                creditSales: r.creditSales ?? r.paymentBreakdown?.credit ?? 0,
            }));
            return { ...res, rows };
        },
        staleTime: 1000 * 60 * 2,      // 2 min — sales change frequently
        refetchOnWindowFocus: false,    // Don't refetch on tab switch
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
        queryFn: async () => {
            const res = await reportsApi.getStockValuation(outletId);
            const beData = res?.data || {};
            const rows: any[] = [];
            for (const p of beData.products || []) {
                for (const b of p.batches || []) {
                    rows.push({
                        productName: p.productName,
                        composition: p.genericName || p.composition || '',
                        batchNo: b.batchNo,
                        expiryDate: b.expiryDate,
                        qtyStrips: b.qty,
                        purchaseRate: b.purchaseRate,
                        mrp: b.mrp,
                        stockValue: b.valuation_purchase,
                        mrpValue: b.valuation_mrp
                    });
                }
            }
            const totalStockValue = beData.total_value_purchase || 0;
            const totalMrpValue = beData.total_value_mrp || 0;
            const potentialMarginPct = totalStockValue > 0 ? (((totalMrpValue - totalStockValue) / totalStockValue) * 100).toFixed(1) : 0;
            return { rows, totalStockValue, totalMrpValue, potentialMarginPct };
        },
        staleTime: 1000 * 60 * 15,     // 15 min — stock changes slowly
        refetchOnWindowFocus: false,    // Don't refetch on tab switch
        enabled: !!outletId,
    });
}

export function useExpiryReportData() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'expiry', outletId],
        queryFn: async () => {
            const res = await reportsApi.getExpiryReport(outletId);
            const beData = res?.data || {};
            const flatBatches: any[] = [];
            for (const p of beData.products || []) {
                for (const b of p.batches || []) {
                    flatBatches.push({
                        ...b,
                        productName: p.productName,
                        composition: p.genericName || p.composition || '',
                        daysRemaining: b.daysToExpiry,
                        stockValue: b.valuationAtRisk,
                        qtyStrips: b.qtyStrips,
                    });
                }
            }
            return flatBatches;
        },
        staleTime: 1000 * 60 * 15,     // 15 min — expiry dates never change
        refetchOnWindowFocus: false,    // Don't refetch on tab switch
        enabled: !!outletId,
    });
}

export function useStaffReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'staff', outletId, dateRange],
        queryFn: async () => {
            const res = await reportsApi.getStaffReport(outletId, dateRange);
            const dataArr = res?.data || [];
            return dataArr.map((s: any) => ({
                staffId: s.staffId,
                staffName: s.staffName,
                role: s.role,
                billsCount: s.totalInvoices ?? s.billsCount ?? 0,
                totalSales: s.totalSalesAmount ?? s.totalSales ?? 0,
                totalDiscount: s.totalDiscountGiven ?? s.totalDiscount ?? 0,
                avgBillValue: s.avgInvoiceValue ?? s.avgBillValue ?? 0,
                avgDiscountPct: s.avgDiscountPct ?? 0,
                cashBills: s.cashBills ?? 0,
                creditBills: s.creditBills ?? 0,
                salesByDay: s.salesByDay ?? [],
            }));
        },
        staleTime: 1000 * 60 * 2,      // 2 min — staff activity is real-time
        refetchOnWindowFocus: false,
        enabled: !!outletId,
    });
}

export function usePurchaseReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'purchases', outletId, dateRange],
        queryFn: async () => {
            const res = await reportsApi.getPurchaseReport(outletId, dateRange);
            const rawItems = res?.data || res?.results || [];
            const rows = rawItems.map((inv: any) => ({
                date: inv.invoiceDate ?? inv.invoice_date ?? inv.date ?? '',
                invoiceNo: inv.invoiceNo ?? inv.invoice_no ?? '',
                distributorName: inv.distributor?.name ?? inv.distributorName ?? 'Unknown',
                itemCount: inv.items?.length ?? inv.itemCount ?? inv.total_items ?? 0,
                grandTotal: parseFloat(inv.grandTotal ?? inv.grand_total ?? 0),
                amountPaid: parseFloat(inv.amountPaid ?? inv.amount_paid ?? 0),
                outstanding: parseFloat(inv.outstanding ?? ((inv.grandTotal ?? inv.grand_total ?? 0) - (inv.amountPaid ?? inv.amount_paid ?? 0))),
            }));
            const totalPurchased = rows.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0);
            const totalPaid = rows.reduce((s: number, r: any) => s + (r.amountPaid || 0), 0);
            const totalOutstanding = rows.reduce((s: number, r: any) => s + (r.outstanding || 0), 0);
            return { rows, totalPurchased, totalPaid, totalOutstanding };
        },
        staleTime: 1000 * 60 * 3,      // 3 min — purchases happen a few times a day
        refetchOnWindowFocus: false,
        enabled: !!outletId,
    });
}

export function useBatchReport(filters: any) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'batch-wise', outletId, filters],
        queryFn: () => reportsApi.getBatchReport(outletId, filters),
        staleTime: 1000 * 60 * 10,     // 10 min — batch data changes slowly
        refetchOnWindowFocus: false,    // Don't refetch on tab switch
        enabled: !!outletId,
    });
}

export function useGSTR1Report(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'gstr1', outletId, dateRange],
        queryFn: () => reportsApi.getGSTR1Report(outletId, dateRange.from, dateRange.to),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useGSTR3BReport(dateRange: DateRangeFilter) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['reports', 'gstr3b', outletId, dateRange],
        queryFn: () => reportsApi.getGSTR3BReport(outletId, dateRange.from, dateRange.to),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}


export function useLockGSTReport() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ outletId, payload }: { outletId: string, payload: { reportType: 'GSTR1' | 'GSTR3B', from: string, to: string, reason?: string } }) =>
            reportsApi.lockGSTReport(outletId, payload),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['reports', 'gst', variables.payload.reportType] });
        }
    });
}

export function useUnlockGSTReport() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ outletId, payload }: { outletId: string, payload: { reportType: 'GSTR1' | 'GSTR3B', from: string, to: string, reason: string } }) =>
            reportsApi.unlockGSTReport(outletId, payload),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['reports', 'gst', variables.payload.reportType] });
        }
    });
}
