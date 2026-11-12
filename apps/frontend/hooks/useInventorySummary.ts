'use client';

import { useQuery } from '@tanstack/react-query';
import { inventoryApi, reportsApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';

const totalOf = (res: any): number => res?.pagination?.totalRecords ?? 0;

/**
 * The numbers shown on the Inventory page: product count, expiring, low stock and stock value.
 *
 * ONE place for them. The tab badges and the stat cards used to fetch their own (the badges pulled
 * whole reports just to count them) through different endpoints and labelled the same figure
 * "batches" on one and "products" on another. React Query shares identical keys, so calling this
 * hook from the page and from the cards costs one request each, not two.
 *
 * Every figure is a PRODUCT count (the list's `totalRecords`).
 */
export function useInventorySummary() {
    const outletId = useOutletId();
    const base = { enabled: !!outletId, staleTime: 1000 * 60 * 2 };

    const total = useQuery({ ...base, queryKey: ['inventory', 'summary', 'total', outletId], queryFn: () => inventoryApi.getStock(outletId, { pageSize: 1 }) });
    const expiring = useQuery({ ...base, queryKey: ['inventory', 'summary', 'expiring', outletId], queryFn: () => inventoryApi.getStock(outletId, { expiringSoon: true, pageSize: 1 }) });
    const lowStock = useQuery({ ...base, queryKey: ['inventory', 'summary', 'low-stock', outletId], queryFn: () => inventoryApi.getStock(outletId, { lowStock: true, pageSize: 1 }) });
    const valuation = useQuery({ ...base, staleTime: 1000 * 60 * 5, queryKey: ['inventory', 'summary', 'valuation', outletId], queryFn: () => reportsApi.getStockValuation(outletId, { summary: true }) });

    return {
        total, expiring, lowStock, valuation,
        counts: { total: totalOf(total.data), expiring: totalOf(expiring.data), lowStock: totalOf(lowStock.data) },
    };
}
