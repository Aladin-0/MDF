'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { applyInventoryPatch, readInventoryParams, type InventoryParams } from '@/lib/inventoryParams';

/**
 * Inventory page state in the URL: a refresh keeps your place, Back works, and a link can be shared
 * (it used to keep the tab and the page in component state, so both were lost on refresh).
 */
export function useInventoryFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const params = useMemo(() => readInventoryParams(new URLSearchParams(searchParams.toString())), [searchParams]);

    const update = useCallback(
        (patch: Partial<InventoryParams>) => {
            // read the live URL so two changes in one tick do not overwrite each other
            const current = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
            const qs = applyInventoryPatch(current, patch).toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [router, pathname],
    );

    const clearFilters = useCallback(() => update({ q: '', schedule: 'all' }), [update]);

    return { params, update, clearFilters };
}
