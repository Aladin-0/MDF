'use client';

import { useEffect, useState } from 'react';
import { productsApi } from '@/lib/apiClient';
import type { ProductSearchResult } from '@/types';

/**
 * Medicine search for the purchase line (same call as the desktop grid cell: `productsApi.search(text, outlet, 'purchase')`):
 * waits 300 ms after the last key, needs 2 letters, drops the answer of an old query, and never shows results for text that is gone.
 */
export function usePurchaseProductSearch(query: string, outletId: string | null | undefined, delayMs = 300) {
    const [results, setResults] = useState<ProductSearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const text = query.trim();
        setResults([]);
        if (text.length < 2 || !outletId) { setSearching(false); return; }
        setSearching(true);
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const found = await productsApi.search(text, outletId, 'purchase', controller.signal);
                if (!controller.signal.aborted) setResults(found);
            } catch {
                if (!controller.signal.aborted) setResults([]);
            } finally {
                if (!controller.signal.aborted) setSearching(false);
            }
        }, delayMs);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, outletId, delayMs]);

    return { results, searching };
}
