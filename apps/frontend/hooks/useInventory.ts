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
 * One page of stock. Sorting and paging happen on the server (it clamps pageSize to 100). The counts
 * for the cards and tab badges live in hooks/useInventorySummary.ts; the Expiring and Low Stock lists
 * load every page through lib/inventoryApi.ts `fetchAllStock`.
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
