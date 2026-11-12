'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { applyFilterPatch, defaultRange, readFilters, type LedgerFilters } from '@/lib/stockLedger';

/**
 * Stock Ledger filters, kept in the URL (?batch=&type=&q=&from=&to=&page=&size=).
 * A refresh keeps your place, Back/Forward work, and a link can be shared.
 *
 * The default date range is written into the URL after the page has mounted instead of being
 * computed while rendering: "today" differs between the server and the browser around midnight
 * and across time zones, which caused hydration mismatches.
 */
export function useLedgerFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const filters = useMemo(() => readFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

    const update = useCallback(
        (patch: Partial<LedgerFilters>) => {
            // read the live URL, not a captured copy, so two changes in one tick do not overwrite each other
            const current = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
            const next = applyFilterPatch(current, patch);
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [router, pathname],
    );

    useEffect(() => {
        if (filters.from && filters.to) return;
        const range = defaultRange();
        update({ from: filters.from || range.from, to: filters.to || range.to, page: filters.page });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.from, filters.to]);

    return { filters, update };
}
