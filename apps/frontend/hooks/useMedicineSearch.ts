'use client';

import { useCallback, useRef, useState } from 'react';
import { useProductSearch } from '@/hooks/useProductSearch';
import { useOutletId } from '@/hooks/useOutletId';
import { productsApi } from '@/lib/apiClient';
import type { ProductSearchResult } from '@/types';

export interface SubstituteTarget { id: string; name: string; composition: string }

interface Options {
    /** What is typed in the search box */
    query: string;
    /** A scanned barcode matched this product (hardware scanner + Enter, or the camera scanner) */
    onBarcodeHit: (product: ProductSearchResult) => void;
    /** Something the user should be told (unknown barcode, substitutes failed to load) */
    onError: (message: string) => void;
    context?: 'billing' | 'purchase';
}

/**
 * The medicine search of the billing screens, shared by the desktop/tablet workspace and the phone layout:
 *  - the normal typed search (words, `C,salt`, `L+price`; see docs/INVENTORY.md "Medicine search"),
 *  - the substitutes view ("same salt, other brands") for one product,
 *  - an immediate barcode lookup (no wait for the typing pause).
 * `results` is what the list should show: the substitutes while that view is open, otherwise the search results.
 */
export function useMedicineSearch({ query, onBarcodeHit, onError, context = 'billing' }: Options) {
    const outletId = useOutletId() as string;
    const { data: searchResults = [], isFetching: searchFetching } = useProductSearch(query, context);

    const [substituteFor, setSubstituteFor] = useState<SubstituteTarget | null>(null);
    const [substituteResults, setSubstituteResults] = useState<ProductSearchResult[]>([]);
    const [substituteLoading, setSubstituteLoading] = useState(false);
    const [substituteReason, setSubstituteReason] = useState<string | undefined>(undefined);
    const ticket = useRef(0);          // a late answer for an earlier product must not replace the current list

    const closeSubstitutes = useCallback(() => {
        ticket.current++;
        setSubstituteFor(null);
        setSubstituteResults([]);
        setSubstituteReason(undefined);
        setSubstituteLoading(false);
    }, []);

    const openSubstitutes = useCallback(async (product: Pick<ProductSearchResult, 'id' | 'name' | 'composition'>) => {
        const mine = ++ticket.current;
        setSubstituteFor({ id: product.id, name: product.name, composition: product.composition });
        setSubstituteResults([]);
        setSubstituteReason(undefined);
        setSubstituteLoading(true);
        try {
            const { products, reason } = await productsApi.substitutes(product.id, outletId, context);
            if (mine !== ticket.current) return;
            setSubstituteResults(products);
            setSubstituteReason(reason);
        } catch (err: any) {
            if (mine !== ticket.current) return;
            setSubstituteFor(null);
            onError(err?.message || 'Could not load substitutes');
        } finally {
            if (mine === ticket.current) setSubstituteLoading(false);
        }
    }, [outletId, context, onError]);

    const scanBarcode = useCallback(async (code: string) => {
        try {
            const found = await productsApi.search(code, outletId, context);
            const hit = found.find((p) => p.barcode === code);
            if (hit) {
                onBarcodeHit(hit);
                return;
            }
            onError(`No medicine has the barcode ${code}. Search it by name; the barcode can be added in Inventory > Edit product.`);
        } catch (err: any) {
            onError(err?.message || 'Barcode lookup failed');
        }
    }, [outletId, context, onBarcodeHit, onError]);

    return {
        results: substituteFor ? substituteResults : searchResults,
        isFetching: substituteFor ? substituteLoading : searchFetching,
        substituteFor,
        substituteReason,
        openSubstitutes,
        closeSubstitutes,
        scanBarcode,
    };
}
