'use client';

import { useQuery } from '@tanstack/react-query';
import { useOutletId } from './useOutletId';
import { inventoryApi } from '@/lib/apiClient';
import { StockFilters } from '@/types';

// Helper: build a stable query key from individual primitives.
// NEVER pass the whole `filters` object — it's a new reference every render.
function stockQueryKey(outletId: string, filters: Partial<StockFilters>, page: number, pageSize: number = 50) {
    return [
        'inventory', 'stock', outletId,
        filters.search ?? '',
        filters.scheduleType ?? 'all',
        filters.lowStock ?? false,
        filters.expiringSoon ?? false,
        filters.sortBy ?? 'name',
        filters.sortOrder ?? 'asc',
        page,
        pageSize,
    ] as const;
}

/**
 * Fetch a single page of stock. 
 */
export function useStockPage(filters: Partial<StockFilters>, page: number, pageSize: number = 50) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: stockQueryKey(outletId, filters, page, pageSize),
        queryFn: () => inventoryApi.getStock(outletId, { ...filters, page, pageSize } as StockFilters),
        staleTime: 1000 * 60 * 3,
        enabled: !!outletId,
        placeholderData: (prev: any) => prev, // Keep previous data visible while fetching
    });
}

/**
 * Simple count-only fetch (pageSize=1) just to get totalRecords for badge.
 */
export function useStockList(filters: Partial<StockFilters> = {}) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: stockQueryKey(outletId, filters, 0),
        queryFn: () => inventoryApi.getStock(outletId, { ...filters, page: 1, pageSize: 1 } as StockFilters),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}

export function useProductBatches(productId: string | null) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['inventory', 'batches', productId, outletId],
        queryFn: () => inventoryApi.getBatches(productId!, outletId),
        enabled: !!productId,
    });
}

export function useStockLedger(batchId: string | null) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['inventory', 'stockledger', outletId, batchId],
        queryFn: () => inventoryApi.getStockLedger(outletId, batchId!),
        enabled: !!batchId,
    });
}

export function useExpiryReport(daysAhead: number = 90) {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['inventory', 'expiry', outletId, daysAhead],
        queryFn: () => inventoryApi.getExpiryReport(outletId),
        staleTime: 1000 * 60 * 10,
        enabled: !!outletId,
    });
}

export function useLowStockReport() {
    const outletId = useOutletId();
    return useQuery({
        queryKey: ['inventory', 'lowstock', outletId],
        queryFn: () => inventoryApi.getLowStock(outletId),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });
}
