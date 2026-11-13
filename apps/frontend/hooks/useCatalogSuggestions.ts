'use client';

import { useEffect, useRef, useState } from 'react';
import { productsApi } from '@/lib/apiClient';
import type { ProductSuggestion, SuggestField } from '@/types';

// answers already fetched in this tab: opening the same box again, or backspacing, shows the list at once
const memory = new Map<string, ProductSuggestion[]>();
const key = (field: SuggestField, q: string) => `${field}:${q.trim().toLowerCase()}`;

/** Test helper: forget every remembered answer */
export const clearSuggestionMemory = () => memory.clear();

/**
 * Options for a product box (manufacturer / composition) from the catalogue. Waits `delayMs` after the last key, cancels the request of
 * text that is already gone, remembers answers, and never throws: if the server cannot be reached the list is just empty and the box
 * stays a plain text box. Nothing is asked while `enabled` is false (the box has not been touched yet).
 */
export function useCatalogSuggestions(field: SuggestField, query: string, enabled = true, delayMs = 200) {
    const k = key(field, query);
    const [items, setItems] = useState<ProductSuggestion[]>(() => memory.get(k) ?? []);
    const [loading, setLoading] = useState(false);
    const latest = useRef(k);
    latest.current = k;

    useEffect(() => {
        if (!enabled) { setLoading(false); return; }
        const cached = memory.get(k);
        if (cached) { setItems(cached); setLoading(false); return; }
        setLoading(true);
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const found = await productsApi.suggest(field, query.trim(), controller.signal);
                memory.set(k, found);
                if (!controller.signal.aborted) setItems(found);
            } catch {
                if (!controller.signal.aborted) setItems([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, delayMs);
        return () => { clearTimeout(timer); controller.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [k, enabled, delayMs]);

    return { items, loading };
}
