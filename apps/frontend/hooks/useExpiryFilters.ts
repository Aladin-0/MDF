'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { applyExpiryPatch, readExpiryParams, type ExpiryFilters } from '@/lib/expiryManager';

/** The Expiry Manager's filters live in the URL: a refresh keeps your place, Back works, a view can be shared. */
export function useExpiryFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const filters = useMemo(() => readExpiryParams(new URLSearchParams(searchParams.toString())), [searchParams]);

    const update = useCallback((patch: Partial<ExpiryFilters>) => {
        const current = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);   // live URL: two changes in one tick must not overwrite each other
        const qs = applyExpiryPatch(current, patch).toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname]);

    return { filters, update };
}
