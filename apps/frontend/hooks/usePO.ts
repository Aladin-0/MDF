import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletId } from '@/hooks/useOutletId';
import { poApi } from '@/lib/poApi';

/** Everything that depends on purchase orders refreshes together after any change. */
export function useInvalidatePO() {
    const qc = useQueryClient();
    return () => {
        ['purchaseOrders', 'purchaseOrder', 'poItems', 'poDistributors', 'shortbook', 'poOpen'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };
}

export function usePOList(filters: Record<string, unknown>) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['purchaseOrders', outletId, filters], queryFn: () => poApi.list(outletId!, filters), enabled: !!outletId, placeholderData: (prev) => prev });
}
export function usePOItems(filters: Record<string, unknown>, enabled = true) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['poItems', outletId, filters], queryFn: () => poApi.items(outletId!, filters), enabled: !!outletId && enabled, placeholderData: (prev) => prev });
}
export function usePODistributors(enabled = true) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['poDistributors', outletId], queryFn: () => poApi.byDistributor(outletId!), enabled: !!outletId && enabled });
}
export function useShortbook(filters: Record<string, unknown> = {}) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['shortbook', outletId, filters], queryFn: () => poApi.shortbook(outletId!, filters), enabled: !!outletId, placeholderData: (prev) => prev });
}
/** The Shortbook's distributor groups (a page of them): cheap, no item rows. */
export function useShortbookGroups(filters: Record<string, unknown> = {}) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['shortbook', 'groups', outletId, filters], queryFn: () => poApi.shortbookGroups(outletId!, filters), enabled: !!outletId, placeholderData: (prev) => prev });
}
/** One group's items, a page at a time. Only runs while the group is open. */
export function useShortbookGroupItems(key: string, filters: Record<string, unknown> = {}, enabled = true) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['shortbook', 'items', outletId, key, filters], queryFn: () => poApi.shortbookGroupItems(outletId!, key, filters), enabled: !!outletId && enabled, placeholderData: (prev) => prev });
}
/** Stock, minimum, on-order, last supplier and "already in the Shortbook?" for the product being added. */
export function useShortbookProductInfo(productId: string | null | undefined) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['shortbook', 'productInfo', outletId, productId], queryFn: () => poApi.shortbookProductInfo(outletId!, productId!), enabled: !!outletId && !!productId, staleTime: 15_000 });
}
export function usePOSettings() {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['poSettings', outletId], queryFn: () => poApi.settings(outletId!), enabled: !!outletId });
}
export function useOpenPOs(distributorId?: string | null) {
    const outletId = useOutletId();
    return useQuery({ queryKey: ['poOpen', outletId, distributorId], queryFn: () => poApi.open(outletId!, distributorId!), enabled: !!outletId && !!distributorId });
}
export { useMutation };
