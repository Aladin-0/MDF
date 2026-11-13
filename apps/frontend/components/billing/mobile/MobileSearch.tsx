'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, ScanLine, X } from 'lucide-react';
import { SheetShell } from './SheetShell';
import { SearchResultRow } from './SearchResultRow';
import { AddLineSheet, describeInBill, sellableBatches } from './AddLineSheet';
import { BarcodeScanner } from './BarcodeScanner';
import { useMedicineSearch } from '@/hooks/useMedicineSearch';
import { useOutletId } from '@/hooks/useOutletId';
import { useBillingStore } from '@/store/billingStore';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { T } from './theme';
import { poApi } from '@/lib/poApi';
import { looksLikeBarcode } from '@/lib/searchSyntax';
import type { ProductSearchResult } from '@/types';

interface Notice {
    text: string;
    /** An out-of-stock medicine the user can put on the Shortbook right from the message */
    product?: { id: string; name: string };
    /** Unknown barcode: offer to search by name instead */
    searchByName?: boolean;
}

interface MobileSearchProps {
    open: boolean;
    onClose: () => void;
}

const chip = 'flex min-h-[44px] touch-manipulation items-center rounded-full border border-sky-300 bg-sky-50 px-4 text-sm font-bold text-sky-800 transition-colors active:bg-sky-100';
const iconBtn = cn('flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center', T.btn);

/**
 * Phone medicine search (design section 3.2): a full-screen step with a sticky 48px search box, short-code chips, a camera Scan button,
 * big result rows (Add / Substitutes), the Add sheet, and "Done". "Add to bill" goes straight back to the bill; "Add & search next" keeps the search open to add another.
 */
export function MobileSearch({ open, onClose }: MobileSearchProps) {
    const outletId = useOutletId() as string;
    const { hasPermission } = usePermissions();
    const { activeDraftId, drafts } = useBillingStore();
    const cart = (activeDraftId && drafts?.[activeDraftId]?.cart) || [];
    const canShortbook = hasPermission('create_bills') || hasPermission('create_purchases');

    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState<ProductSearchResult | null>(null);
    const [scanning, setScanning] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [shortbooked, setShortbooked] = useState<Record<string, boolean>>({});
    const inputRef = useRef<HTMLInputElement>(null);
    const fromBarcode = useRef(false);

    const selectProduct = useCallback((product: ProductSearchResult) => {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) document.activeElement.blur();   // put the keyboard away
        if (sellableBatches(product).length === 0) {
            setNotice({
                text: (product.batches || []).length === 0 ? `No stock available for ${product.name}.` : `No valid stock (unexpired, quantity above 0) for ${product.name}.`,
                product: { id: product.id, name: product.name },
            });
            return;
        }
        setNotice(null);
        setAdding(product);
    }, []);

    const {
        results, isFetching, substituteFor, substituteReason, openSubstitutes, closeSubstitutes, scanBarcode,
    } = useMedicineSearch({
        query,
        onBarcodeHit: selectProduct,
        onError: (text) => setNotice({ text, searchByName: fromBarcode.current }),
    });

    const runBarcode = async (code: string) => {
        fromBarcode.current = true;
        try { await scanBarcode(code); } finally { fromBarcode.current = false; }
    };

    // A fresh start every time the screen is opened
    useEffect(() => {
        if (open) {
            const t = setTimeout(() => inputRef.current?.focus(), 80);
            return () => clearTimeout(t);
        }
        setQuery('');
        setAdding(null);
        setScanning(false);
        setNotice(null);
        closeSubstitutes();
    }, [open, closeSubstitutes]);

    const insertTip = (kind: 'salt' | 'price') => {
        if (substituteFor) closeSubstitutes();
        if (kind === 'salt') setQuery((q) => `C,${q.replace(/^C,/i, '')}`);
        else setQuery((q) => (/^[A-Za-z]+$/.test(q) ? `${q}+` : 'L+'));
        inputRef.current?.focus();
    };

    const addToShortbook = async (target: { id: string; name: string }) => {
        try {
            await poApi.shortbookAdd(outletId, { productId: target.id, qty: 1, source: 'billing' });
            setShortbooked((s) => ({ ...s, [target.id]: true }));
            setNotice((n) => (n?.product?.id === target.id ? { text: `${target.name} is on the Shortbook.` } : n));
        } catch (e: any) {
            setNotice({ text: e?.message || 'Could not add to the Shortbook' });
        }
    };

    const typed = query.trim();
    const searching = typed.length >= 2;

    const footer = (
        <div>
            <button type="button" data-testid="search-done" onClick={onClose} className={cn('h-12 w-full touch-manipulation text-base', T.cta)}>
                Done
            </button>
        </div>
    );

    return (
        <>
            <SheetShell open={open} onClose={onClose} title="Add medicine" full footer={footer} bodyClassName={cn(T.page, 'pt-0')}>
                <div className="sticky top-0 z-10 -mx-4 border-b border-slate-300 bg-slate-200 px-4 pb-3 pt-3 mb-3">
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label="Back to bill" onClick={onClose} className={iconBtn}>
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="relative min-w-0 flex-1">
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="search"
                                enterKeyHint="search"
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                aria-label="Search medicine"
                                placeholder="Name, C,salt, L+price or barcode…"
                                data-testid="mobile-search-input"
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setNotice(null); if (substituteFor) closeSubstitutes(); }}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') return;
                                    e.preventDefault();
                                    if (!substituteFor && looksLikeBarcode(query)) void runBarcode(query.trim());
                                    else e.currentTarget.blur();
                                }}
                                className={cn('h-12 w-full pl-3 pr-12 text-base font-medium', T.input, 'border-sky-500')}
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    data-testid="clear-search"
                                    onClick={() => { setQuery(''); setNotice(null); closeSubstitutes(); inputRef.current?.focus(); }}
                                    className="absolute right-0.5 top-0.5 flex h-11 w-11 items-center justify-center rounded-md text-slate-700 active:bg-slate-100"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                        <button type="button" data-testid="scan-button" aria-label="Scan barcode with the camera" onClick={() => setScanning(true)} className={iconBtn}>
                            <ScanLine className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2" aria-label="Search shortcuts">
                        <button type="button" data-testid="tip-price" onClick={() => insertTip('price')} className={chip}>L+175 price</button>
                        <button type="button" data-testid="tip-salt" onClick={() => insertTip('salt')} className={chip}>C,salt</button>
                    </div>
                </div>

                {notice && (
                    <div role="alert" data-testid="search-notice" className="mb-3 flex flex-col gap-2 rounded-lg border border-red-300 bg-red-100 px-3 py-2.5 text-sm font-semibold text-red-900">
                        <span>{notice.text}</span>
                        {notice.product && canShortbook && !shortbooked[notice.product.id] && (
                            <button type="button" data-testid="add-to-shortbook" onClick={() => void addToShortbook(notice.product!)} className="h-11 touch-manipulation self-start rounded-lg border-2 border-red-400 bg-white px-3 text-sm font-bold text-red-800 active:bg-red-100">
                                Add to Shortbook
                            </button>
                        )}
                        {notice.searchByName && (
                            <button type="button" data-testid="search-by-name" onClick={() => { setNotice(null); setQuery(''); inputRef.current?.focus(); }} className="h-11 touch-manipulation self-start rounded-lg border-2 border-red-400 bg-white px-3 text-sm font-bold text-red-800 active:bg-red-100">
                                Search by name
                            </button>
                        )}
                    </div>
                )}

                {substituteFor && (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2">
                        <div className="min-w-0 text-sm font-semibold text-amber-950">
                            Substitutes for <span className="font-extrabold">{substituteFor.name}</span> · same salt: {substituteFor.composition || '—'}
                        </div>
                        <button type="button" data-testid="close-substitutes" onClick={() => { closeSubstitutes(); inputRef.current?.focus(); }} className="flex h-11 shrink-0 touch-manipulation items-center gap-1 rounded-full border-2 border-amber-400 bg-white px-3 text-sm font-bold text-amber-900 active:bg-amber-100">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </button>
                    </div>
                )}

                {!substituteFor && !searching ? (
                    <p className="py-8 text-center text-sm font-medium text-slate-700">Type at least 2 letters of the medicine name, or scan the barcode.</p>
                ) : isFetching && results.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm font-medium text-slate-700"><Loader2 className="h-4 w-4 animate-spin" /> {substituteFor ? 'Finding substitutes…' : 'Searching…'}</div>
                ) : results.length === 0 ? (
                    <p data-testid="search-empty" className="py-8 text-center text-sm font-medium text-slate-700">
                        {substituteFor
                            ? (substituteReason === 'no_composition'
                                ? `No salt is recorded for ${substituteFor.name}, so no substitutes can be suggested.`
                                : `No other brand with the same salt as ${substituteFor.name}.`)
                            : `No medicines found for "${typed}".`}
                    </p>
                ) : (
                    <ul className="space-y-3 pb-2">
                        {results.map((product) => (
                            <SearchResultRow
                                key={product.id}
                                product={product}
                                onAdd={selectProduct}
                                inBill={describeInBill(cart, product.id)}
                                onSubstitutes={substituteFor ? undefined : (p) => { void openSubstitutes(p); }}
                                onShortbook={canShortbook ? (p) => void addToShortbook({ id: p.id, name: p.name }) : undefined}
                                shortbookDone={!!shortbooked[product.id]}
                            />
                        ))}
                    </ul>
                )}
            </SheetShell>

            <AddLineSheet
                product={open ? adding : null}
                onClose={() => setAdding(null)}
                onAdded={() => onClose()}      // one Add button, and it goes straight back to the bill
            />
            <BarcodeScanner
                open={open && scanning}
                onClose={() => setScanning(false)}
                onCode={(code) => { void runBarcode(code); }}
            />
        </>
    );
}
