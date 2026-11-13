'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { differenceInDays } from 'date-fns';
import { X, AlertTriangle, ChevronDown, ChevronUp, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PurchaseItemFormData, ProductSearchResult } from '@/types';
import { productsApi } from '@/lib/apiClient';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { calculateLandingRate } from '@/lib/purchase-calculations';
import { formatExpiryForDisplay, getExpiryStatus, calcPTR, calcPTS, maskExpiryInput, finishExpiryInput } from '@/lib/purchaseLine';
import { lineAmount } from '@/lib/purchaseEntry';
import { MAX_PKG, pkgNote, pkgOrZero, sanitizePkgInput } from '@/lib/purchasePack';

interface ItemFieldError { message?: string; }

/** Compare product names ignoring punctuation / spacing ("DOLO-650" == "DOLO 650"). */
const normName = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

interface Props {
    index: number;
    value: PurchaseItemFormData;
    onChange: (index: number, field: keyof PurchaseItemFormData, value: string | number) => void;
    onRemove: (index: number) => void;
    onSelectProduct: (index: number, product: ProductSearchResult) => void;
    onOpenAddProduct: (index: number, name: string) => void;
    outletId: string;
    errors?: Partial<Record<keyof PurchaseItemFormData, ItemFieldError>>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export { formatExpiryForDisplay };


// ─── Shared cell input — plain <input> for full table cell control ────────────
// We intentionally do NOT use shadcn Input here because its internal padding
// and ring classes interfere with table cell sizing and spinner removal.

const cellInputCls = (err = false, align: 'left' | 'right' = 'left') =>
    cn(
        // The table cell supplies the grid line and focus outline.
        'h-8 w-full min-w-0 scroll-mb-24 scroll-mt-[calc(var(--app-header-h,0px)+3rem)] rounded-none border-0 bg-transparent px-1.5 text-xs font-medium tabular-nums text-slate-900 outline-none placeholder:text-slate-500',
        // spinner removal — works on plain <input>, not shadcn
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        align === 'right' && 'text-right',
        err
            ? 'bg-red-50 ring-1 ring-inset ring-red-400'
            : 'focus:bg-transparent',
    );

// ─── Column definitions (single source of truth for widths) ──────────────────
// Used in both <colgroup> (in the parent table) and exported here for the parent.

export const PURCHASE_ITEM_COLS = [
    { key: '#',         width: 32  },
    { key: 'product',   width: 230 },
    { key: 'hsn',       width: 80  },
    { key: 'batch',     width: 104 },
    { key: 'expiry',    width: 90  },
    { key: 'pkg',       width: 60  },
    { key: 'qty',       width: 72  },
    { key: 'free',      width: 52  },
    { key: 'mrp',       width: 84  },
    { key: 'rate',      width: 88  },
    { key: 'gst',       width: 52  },
    { key: 'ptr',       width: 70  },
    { key: 'pts',       width: 70  },
    { key: 'disc',      width: 60  },
    { key: 'amount',    width: 104 },
    { key: 'expand',    width: 30  },
    { key: 'remove',    width: 30  },
];

/** Stock for the product list: whole numbers stay whole, fractions (loose packs) are cut to one decimal, never 11.866666666666667 */
export function formatStockQty(n: number | string | null | undefined): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchaseItemRow({
    index, value, onChange, onRemove,
    onSelectProduct, onOpenAddProduct, outletId, errors,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    // Product search state
    const [query, setQuery]               = useState('');
    const [results, setResults]           = useState<ProductSearchResult[]>([]);
    const [searching, setSearching]       = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef              = useRef<AbortController | null>(null);
    // Enter pressed while a search is in flight: pick the first result of THAT
    // search when it arrives (never a stale result from the previous query).
    const pendingEnterRef                 = useRef(false);
    const wrapperRef                      = useRef<HTMLDivElement>(null);
    const inputRef                        = useRef<HTMLInputElement>(null);
    const portalRef                       = useRef<HTMLDivElement>(null);

    const { data: settings } = useOutletSettings();
    const landingRate = calculateLandingRate(
        value.purchaseRate || 0,
        value.qty || 0,
        value.freeQty || 0,
        value.discountPct || 0,
        value.cashDiscountPct || 0,
        value.gstRate || 0,
        value.cess || 0,
        value.freightPerUnit || 0,
        settings ? (!settings.gstRegistered || settings.landingCostIncludeGst) : false,
        settings?.landingCostIncludeFreight ?? true,
        value.otherCostPerUnit || 0
    );
    
    // Sale rate logic removed. 
    // We intentionally let the new batches fallback to MRP later.

    // Helper to calculate dropdown position (viewport-relative for position:fixed)
    const openDropdown = () => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            const top = rect.bottom + 2;
            const left = rect.left;
            // same place -> keep the old object, so re-checking on every render cannot loop
            setDropdownStyle((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
        }
        setDropdownOpen(true);
    };

    // The page above the table can change height while the list is open (e.g. the "add a medicine" message disappears
    // as soon as you type): follow the input instead of staying where the list first opened.
    useEffect(() => {
        if (dropdownOpen) openDropdown();
    });

    // Close dropdown on outside click — must check both wrapper and portal
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const inWrapper = wrapperRef.current?.contains(target);
            const inPortal  = portalRef.current?.contains(target);
            if (!inWrapper && !inPortal) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Sync dropdown position on scroll/resize when open
    useEffect(() => {
        if (!dropdownOpen) return;

        const updatePosition = (e?: Event) => {
            // Scrolling the results list itself must not re-anchor the dropdown
            if (e && portalRef.current?.contains(e.target as Node)) return;
            openDropdown();
        };

        // Use capture: true to catch scrolls on overflow ancestors
        document.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            document.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [dropdownOpen]);

    // Keep the keyboard-highlighted option visible inside the scrollable results list
    useEffect(() => {
        if (!dropdownOpen || highlightedIndex < 0) return;
        portalRef.current
            ?.querySelector<HTMLElement>(`[data-result-index="${highlightedIndex}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [dropdownOpen, highlightedIndex]);

    const handleQueryChange = (raw: string) => {
        setQuery(raw);
        onChange(index, 'productName', raw);
        onChange(index, 'productId', '' as unknown as number);
        onChange(index, 'isCustom', false as unknown as number);
        // Results belong to the previous query — drop them now so Enter can't
        // select a product the user is no longer looking at.
        setResults([]);
        setHighlightedIndex(-1);
        pendingEnterRef.current = false;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        if (raw.length < 2) {
            setResults([]);
            setHighlightedIndex(-1);
            // Any in-flight search was just aborted and no new one starts:
            // clear the spinner so Enter moves on instead of waiting forever.
            setSearching(false);
            if (raw.length > 0) openDropdown(); // show "no results + add" even for short queries
            return;
        }

        setSearching(true);
        openDropdown();
        debounceRef.current = setTimeout(async () => {
            if (!outletId) {
                setResults([]);
                setHighlightedIndex(-1);
                setSearching(false);
                return;
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;
            try {
                const found = await productsApi.search(raw, outletId, 'purchase', controller.signal);
                if (controller.signal.aborted) return;
                setResults(found);
                setHighlightedIndex(found.length > 0 ? 0 : -1);
                if (pendingEnterRef.current) {
                    pendingEnterRef.current = false;
                    if (found.length > 0) handleSelectResult(found[0]);
                }
            } catch (err: any) {
                if (err?.name !== 'AbortError') {
                    setResults([]);
                    setHighlightedIndex(-1);
                }
            } finally {
                // An aborted (superseded) search must not flip the spinner off
                // while the newer search is still running.
                if (abortControllerRef.current === controller) {
                    setSearching(false);
                }
            }
        }, 300);
    };

    const handleSelectResult = (product: ProductSearchResult) => {
        setQuery('');
        setResults([]);
        setHighlightedIndex(-1);
        setDropdownOpen(false);
        onSelectProduct(index, product);

        // After selection, advance focus to next input in row (HSN)
        const focusHsn = (retries = 10) => {
            const row = wrapperRef.current?.closest('[data-cart-row]');
            if (row) {
                const target = (row.querySelector('input[data-field="hsn"]') ||
                    row.querySelector('input:not([disabled]):not([type="hidden"])')) as HTMLInputElement | null;
                if (target) {
                    target.focus();
                    target.select?.();
                    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    return;
                }
            }
            if (retries > 0) {
                setTimeout(() => focusHsn(retries - 1), 30);
            }
        };
        setTimeout(() => focusHsn(10), 30);
    };

    const handleAddNew = () => {
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        onOpenAddProduct(index, query);
    };

    const num = (field: keyof PurchaseItemFormData, raw: string) =>
        onChange(index, field, parseFloat(raw) || 0);

    const expStatus = getExpiryStatus(value.expiryDate);
    const total     = lineAmount(value);
    // opaque on purpose: the pinned columns (#, Product, Amount, expand, remove) sit on top of columns scrolling underneath them
    const rowBg     = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
    const effPkg    = pkgOrZero(value.pkg);
    // under the PKG box: why it is flagged (differs from the catalogue / very large), else the unit it counts (Tablet)
    const note      = pkgNote(value);
    const pkgHint   = note ? { text: note.text, warn: true, title: note.kind === 'differs' ? 'The catalogue has a different pack size for this product. Stock is added as packs of the size entered here.' : 'More than 200 units in one pack is unusual: check it' }
                           : value.packUnitLabel ? { text: value.packUnitLabel, warn: false, title: value.packUnitLabel } : null;

    const handleMrpChange = (raw: string) => {
        const mrp = parseFloat(raw) || 0;
        onChange(index, 'mrp', mrp);
        if (mrp > 0) {
            if (!value.ptr)      onChange(index, 'ptr', calcPTR(mrp, value.gstRate));
            if (!value.pts)      onChange(index, 'pts', calcPTS(calcPTR(mrp, value.gstRate)));
        }
    };

    // One cell-level border system keeps the header and editable rows aligned.
    const td = 'h-9 border-r border-b border-[#D8DEE8] px-0.5 py-0.5 align-middle hover:bg-slate-50 focus-within:bg-white focus-within:shadow-[inset_0_0_0_2px_#2563eb]';

    return (
        <>
            {/* Portal: Search dropdown (rendered at document.body to escape overflow clipping) */}
            {dropdownOpen && !value.productId && dropdownStyle && createPortal(
                <div
                    ref={portalRef}
                    className="z-[9999] w-[min(420px,calc(100vw-2rem))] min-w-[280px] rounded-sm border border-slate-300 bg-white shadow-lg"
                    style={{
                        position: 'fixed',
                        top: `${dropdownStyle.top}px`,
                        left: `${dropdownStyle.left}px`,
                    }}
                >
                    {searching && (
                        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            Searching…
                        </div>
                    )}

                    {!searching && results.length === 0 && query.length >= 2 && (
                        <div className="px-3 py-2 text-xs text-slate-500">
                            No results for &ldquo;{query}&rdquo;
                        </div>
                    )}

                    {/* Results scroll inside a box that fits exactly 4 options (4 x 62px);
                        the "Add new product" button below stays pinned and always visible. */}
                    <div className="max-h-[248px] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                    {!searching && results.map((product, pIdx) => (
                        <button
                            key={product.id}
                            type="button"
                            data-result-index={pIdx}
                            className={cn(
                                "flex min-h-[62px] w-full flex-col justify-center px-3 py-2 text-left transition-colors",
                                highlightedIndex === pIdx ? "border-l-2 border-primary bg-slate-100 text-slate-900" : "border-l-2 border-transparent hover:bg-slate-50"
                            )}
                            onMouseEnter={() => setHighlightedIndex(pIdx)}
                            onMouseDown={(e) => { e.preventDefault(); handleSelectResult(product); }}
                        >
                            <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                            {product.composition && (
                                <span className="truncate text-xs text-slate-600">{product.composition}</span>
                            )}
                            <span className="text-xs tabular-nums text-slate-600">
                                GST {product.gstRate}% · Stock {formatStockQty(product.totalStock)}
                            </span>
                        </button>
                    ))}
                    </div>

                    {/* Always show "Add new product" at bottom */}
                    <button
                        type="button"
                        data-result-index={results.length}
                        className={cn(
                            "flex w-full items-center gap-1.5 border-t border-dashed border-slate-200 px-3 py-2 text-left transition-colors",
                            highlightedIndex === results.length ? "border-l-2 border-primary bg-slate-100 text-slate-900" : "border-l-2 border-transparent hover:bg-slate-50"
                        )}
                        onMouseEnter={() => setHighlightedIndex(results.length)}
                        onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
                    >
                        <Plus className="h-3 w-3 text-primary" aria-hidden="true" />
                        <span className="text-xs font-medium text-primary">
                            {query ? `Add "${query}" as new product` : 'Add new product'}
                        </span>
                    </button>
                </div>,
                document.body,
            )}

            <tr data-cart-row={index} className={cn('group hover:bg-slate-50 focus-within:bg-slate-50', rowBg)}>

                {/* # */}
                <td className={cn(td, 'sticky left-0 z-10 border-l text-center text-[11px] font-medium text-slate-500 group-hover:bg-slate-50 group-focus-within:bg-slate-50', rowBg)}>
                    {index + 1}
                </td>

                {/* Product */}
                <td className={cn(td, 'sm:sticky sm:left-8 sm:z-10 group-hover:bg-slate-50 group-focus-within:bg-slate-50', rowBg)}>
                    <div ref={wrapperRef} className="relative">
                        {value.productId ? (
                            /* Product already selected — show name + reset button */
                            <div className="flex min-w-0 items-center gap-1">
                                <span className="min-w-0 flex-1 truncate px-1.5 text-xs font-semibold text-slate-900" title={value.productName}>
                                    {value.productName}
                                </span>
                                <button
                                    type="button"
                                    title="Choose a different medicine"
                                    aria-label={`Choose a different medicine for row ${index + 1}`}
                                    onClick={() => {
                                        onChange(index, 'productId', '' as unknown as number);
                                        onChange(index, 'productName', '');
                                        onChange(index, 'isCustom', false as unknown as number);
                                        setQuery('');
                                        setResults([]);
                                        setHighlightedIndex(-1);
                                    }}
                                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded bg-slate-100 text-sm font-bold leading-none text-slate-700 hover:bg-red-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    <span aria-hidden="true">×</span>
                                </button>
                            </div>
                        ) : (
                            /* Search input */
                            <input
                                ref={inputRef}
                                data-field="product-search"
                                aria-label={`Product, medicine ${index + 1}`}
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={!!errors?.productName || undefined}
                                title={errors?.productName?.message}
                                className={cn(cellInputCls(!!errors?.productName), 'w-full')}
                                value={query || value.productName}
                                data-dropdown-open={dropdownOpen ? 'true' : 'false'}
                                placeholder="Search product…"
                                onChange={(e) => handleQueryChange(e.target.value)}
                                onFocus={() => {
                                    if (query.length >= 2 || results.length > 0) openDropdown();
                                }}
                                onKeyDown={(e) => {
                                    if (dropdownOpen) {
                                        const totalOptions = results.length + 1; // including add new button
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                            setHighlightedIndex((prev) => (prev + 1) % totalOptions);
                                            return;
                                        }
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                            setHighlightedIndex((prev) => (prev <= 0 ? totalOptions - 1 : prev - 1));
                                            return;
                                        }
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                            if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                                                handleSelectResult(results[highlightedIndex]);
                                            } else if (highlightedIndex === results.length) {
                                                handleAddNew();
                                            } else if (results.length > 0) {
                                                handleSelectResult(results[0]);
                                            } else if (searching) {
                                                // Wait for the search for what was just typed.
                                                pendingEnterRef.current = true;
                                            } else {
                                                setDropdownOpen(false);
                                                // Advance to next input (HSN)
                                                setTimeout(() => {
                                                    const row = wrapperRef.current?.closest('[data-cart-row]');
                                                    if (row) {
                                                        const target = (row.querySelector('input[data-field="hsn"]') ||
                                                            row.querySelector('input:not([disabled]):not([type="hidden"])')) as HTMLInputElement | null;
                                                        if (target) {
                                                            target.focus();
                                                            target.select?.();
                                                        }
                                                    }
                                                }, 20);
                                            }
                                            return;
                                        }
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                            setDropdownOpen(false);
                                            return;
                                        }
                                    }
                                }}
                            />
                        )}

                    </div>
                    {errors?.productName && (
                        <p className="mt-0.5 text-[10px] leading-none text-red-500">{errors.productName.message}</p>
                    )}
                    {value.ocrOriginalName && (
                        (() => {
                            const billName = value.ocrOriginalName;
                            const sameName = normName(billName) === normName(value.productName);
                            const lowConfidence = !!value.productId && (value.ocrMatchConfidence ?? 1) < 0.9;
                            const suggestions = !value.productId ? (value.ocrSuggestions ?? []) : [];
                            if (sameName && !lowConfidence && suggestions.length === 0) return null;
                            return (
                                <div className="px-1.5 pb-0.5">
                                    {(!sameName || lowConfidence) && (
                                        <p
                                            className={cn(
                                                'truncate text-[10px] leading-tight',
                                                lowConfidence ? 'font-medium text-amber-700' : 'text-slate-500',
                                            )}
                                            title={lowConfidence ? `Bill says "${billName}" — please confirm the product` : `Bill says "${billName}"`}
                                        >
                                            Bill: {billName}{lowConfidence ? ' · check' : ''}
                                        </p>
                                    )}
                                    {suggestions.length > 0 && (
                                        <div className="mt-0.5 flex flex-wrap gap-1">
                                            {suggestions.slice(0, 3).map((s) => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    title={`Use ${s.name}`}
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => onSelectProduct(index, {
                                                        id: s.id,
                                                        name: s.name,
                                                        packSize: s.packSize ?? undefined,
                                                        packUnit: s.packUnit ?? undefined,
                                                        hsnCode: s.hsnCode ?? '',
                                                        gstRate: s.gstRate ?? 0,
                                                        mrp: s.mrp ?? 0,
                                                        saleRate: 0,
                                                        batches: [],
                                                    } as unknown as ProductSearchResult)}
                                                    className="max-w-[180px] truncate rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-blue-100"
                                                >
                                                    {s.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()
                    )}
                </td>

                {/* HSN */}
                <td className={td}>
                    <input
                        data-field="hsn"
                        aria-label={`HSN, medicine ${index + 1}`}
                        autoComplete="off"
                        spellCheck={false}
                        className={cellInputCls()}
                        value={value.hsnCode}
                        placeholder="300490"
                        onChange={(e) => onChange(index, 'hsnCode', e.target.value)}
                    />
                </td>

                {/* Batch */}
                <td className={td}>
                    <input
                        data-field="batch"
                        aria-label={`Batch, medicine ${index + 1}`}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={!!errors?.batchNo || undefined}
                        title={errors?.batchNo?.message}
                        className={cellInputCls(!!errors?.batchNo)}
                        value={value.batchNo}
                        placeholder="Batch No"
                        onChange={(e) => onChange(index, 'batchNo', e.target.value)}
                    />
                </td>

                {/* Expiry — MM/YYYY text input, compact */}
                <td className={td}>
                    <div className="flex items-center gap-0.5">
                        <input
                            data-field="expiry"
                            aria-label={`Expiry (MM/YYYY), medicine ${index + 1}`}
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={!!errors?.expiryDate || undefined}
                            title={errors?.expiryDate?.message}
                            aria-describedby={expStatus !== 'ok' ? `expiry-note-${index}` : undefined}
                            className={cn(
                                cellInputCls(!!errors?.expiryDate),
                                expStatus === 'expired' && 'border-red-400 bg-red-50',
                                expStatus === 'near'    && 'border-orange-300 bg-orange-50',
                            )}
                            placeholder="MM/YYYY"
                            maxLength={7}
                            value={formatExpiryForDisplay(value.expiryDate)}
                            onChange={(e) => onChange(index, 'expiryDate', maskExpiryInput(e.target.value))}
                            onBlur={() => { if (value.expiryDate) onChange(index, 'expiryDate', finishExpiryInput(value.expiryDate)); }}
                        />
                        {expStatus !== 'ok' && (
                            <AlertTriangle className={cn(
                                'h-3 w-3 shrink-0',
                                expStatus === 'expired' ? 'text-red-600' : 'text-orange-600',
                            )} aria-hidden="true" />
                        )}
                    </div>
                    {expStatus !== 'ok' && (
                        <p id={`expiry-note-${index}`} data-testid="expiry-note" className={cn('px-1 text-[11px] font-bold leading-none', expStatus === 'expired' ? 'text-red-700' : 'text-orange-800')}>
                            {expStatus === 'expired' ? 'Expired' : 'Under 90 days'}
                        </p>
                    )}
                </td>

                {/* Pkg */}
                <td className={td}>
                    <input
                        data-field="pkg"
                        aria-label={`Pkg (units per pack), medicine ${index + 1}`}
                        autoComplete="off"
                        aria-invalid={!!errors?.pkg || undefined}
                        aria-describedby={pkgHint ? `pkg-note-${index}` : undefined}
                        title={errors?.pkg?.message}
                        // whole numbers only: a decimal, a minus sign or a paste of "1,5" never gets in; blank stays blank (it is never 1)
                        inputMode="numeric"
                        maxLength={String(MAX_PKG).length}
                        className={cellInputCls(!!errors?.pkg, 'right')}
                        value={value.pkg === undefined || value.pkg === null || (value.pkg as unknown) === '' ? '' : String(value.pkg)}
                        placeholder="Pkg"
                        onChange={(e) => {
                            const clean = sanitizePkgInput(e.target.value);
                            onChange(index, 'pkg', clean === '' ? ('' as unknown as number) : Number(clean));
                        }}
                    />
                    {errors?.pkg?.message ? (
                        <p id={`pkg-note-${index}`} data-testid="pkg-error" className="w-full text-right text-[11px] font-bold leading-tight text-red-700">{errors.pkg.message}</p>
                    ) : pkgHint ? (
                        <p id={`pkg-note-${index}`} data-testid="pkg-note" title={pkgHint.title}
                            className={cn('w-full truncate text-right text-[11px] leading-none', pkgHint.warn ? 'font-bold text-amber-800' : 'text-slate-600')}>
                            {pkgHint.text}
                        </p>
                    ) : null}
                </td>

                {/* Qty */}
                <td className={td}>
                    <input
                        data-field="qty"
                        aria-label={`Qty (packs), medicine ${index + 1}`}
                        autoComplete="off"
                        aria-invalid={!!errors?.qty || undefined}
                        title={errors?.qty?.message}
                        type="number" min={0}
                        className={cellInputCls(!!errors?.qty, 'right')}
                        value={value.qty || ''}
                        placeholder="Qty"
                        onChange={(e) => num('qty', e.target.value)}
                    />
                    {effPkg > 1 && value.qty > 0 && (
                        <p className="text-right text-[11px] leading-none text-slate-600">
                            ={effPkg * value.qty}u
                        </p>
                    )}
                </td>

                {/* Free */}
                <td className={td}>
                    <input
                        data-field="free"
                        aria-label={`Free (packs), medicine ${index + 1}`}
                        autoComplete="off"
                        type="number" min={0}
                        className={cellInputCls(false, 'right')}
                        value={value.freeQty || ''}
                        placeholder="Free"
                        onChange={(e) => num('freeQty', e.target.value)}
                    />
                </td>

                {/* MRP */}
                <td className={td}>
                    <input
                        data-field="mrp"
                        aria-label={`MRP, medicine ${index + 1}`}
                        autoComplete="off"
                        aria-invalid={!!errors?.mrp || undefined}
                        title={errors?.mrp?.message}
                        type="number" min={0} step="0.01"
                        className={cellInputCls(!!errors?.mrp, 'right')}
                        value={value.mrp || ''}
                        onChange={(e) => handleMrpChange(e.target.value)}
                    />
                </td>

                {/* Rate */}
                <td className={td}>
                    <input
                        data-field="rate"
                        aria-label={`Rate (purchase rate), medicine ${index + 1}`}
                        autoComplete="off"
                        aria-invalid={!!errors?.purchaseRate || undefined}
                        title={errors?.purchaseRate?.message}
                        type="number" min={0} step="0.01"
                        className={cellInputCls(!!errors?.purchaseRate, 'right')}
                        value={value.purchaseRate || ''}
                        onChange={(e) => num('purchaseRate', e.target.value)}
                    />
                </td>

                {/* GST% */}
                <td className={td}>
                    <input
                        data-field="gst"
                        aria-label={`GST%, medicine ${index + 1}`}
                        autoComplete="off"
                        type="number" min={0}
                        className={cellInputCls(false, 'right')}
                        value={value.gstRate || ''}
                        onChange={(e) => num('gstRate', e.target.value)}
                    />
                </td>

                {/* PTR */}
                <td className={td}>
                    <input
                        data-field="ptr"
                        aria-label={`PTR, medicine ${index + 1}`}
                        autoComplete="off"
                        type="number" min={0} step="0.01"
                        className={cellInputCls(false, 'right')}
                        value={value.ptr || ''}
                        onChange={(e) => num('ptr', e.target.value)}
                    />
                </td>

                {/* PTS */}
                <td className={td}>
                    <input
                        data-field="pts"
                        aria-label={`PTS, medicine ${index + 1}`}
                        autoComplete="off"
                        type="number" min={0} step="0.01"
                        className={cellInputCls(false, 'right')}
                        value={value.pts || ''}
                        onChange={(e) => num('pts', e.target.value)}
                    />
                </td>

                {/* Disc% */}
                <td className={td}>
                    <input
                        data-field="disc"
                        aria-label={`Disc% (discount), medicine ${index + 1}`}
                        autoComplete="off"
                        type="number" min={0} max={100} step="0.01"
                        className={cellInputCls(false, 'right')}
                        value={value.discountPct || ''}
                        onChange={(e) => num('discountPct', e.target.value)}
                    />
                </td>

                {/* Amount */}
                <td className={cn(td, 'bg-slate-100 px-1.5 text-right group-hover:bg-slate-100 sm:sticky sm:right-[60px] sm:z-10 sm:shadow-[-6px_0_6px_-6px_rgba(15,23,42,0.3)]')}>
                    <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {total.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                </td>

                {/* Expand */}
                <td className={cn(td, 'text-center sm:sticky sm:right-[30px] sm:z-10 group-hover:bg-slate-50 group-focus-within:bg-slate-50', rowBg)}>
                    <Button
                        type="button" variant="ghost" size="icon"
                        title={expanded ? 'Hide pricing details' : 'Show pricing details'}
                        aria-label={expanded ? `Hide pricing details for item ${index + 1}` : `Show pricing details for item ${index + 1}`}
                        aria-expanded={expanded}
                        className={cn(
                            'h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                            expanded && 'bg-slate-100 text-slate-900',
                        )}
                        onClick={() => setExpanded((x) => !x)}
                    >
                        {expanded
                            ? <ChevronUp  className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                    </Button>
                </td>

                {/* Remove */}
                <td className={cn(td, 'text-center sm:sticky sm:right-0 sm:z-10 group-hover:bg-slate-50 group-focus-within:bg-slate-50', rowBg)}>
                    <Button
                        type="button" variant="ghost" size="icon"
                        className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-300"
                        aria-label={`Remove item ${index + 1}`}
                        title={`Remove item ${index + 1}`}
                        onClick={() => onRemove(index)}
                    >
                        <X className="h-3 w-3" aria-hidden="true" />
                    </Button>
                </td>
            </tr>

            {/* ── Expanded row ──────────────────────────────────────────── */}
            {expanded && (
                <tr className="bg-slate-100/70">
                    <td colSpan={17} className="border-x border-b-2 border-x-[#D8DEE8] border-b-slate-300 px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-7">
                            <span className="shrink-0 border-r border-slate-300 pr-3 text-xs font-semibold text-slate-800">
                                Pricing Details
                            </span>

                            {[
                                { label: 'Cess%',      field: 'cess'            as const, width: 'w-12' },
                                { label: 'Freight/Unit ₹', field: 'freightPerUnit' as const, width: 'w-20' },
                                { label: 'Other/Unit ₹',   field: 'otherCostPerUnit' as const, width: 'w-20' },
                            ].map(({ label, field, width }) => (
                                <div key={field} className="flex items-center gap-1.5">
                                    <label className="whitespace-nowrap text-xs text-slate-700">
                                        {label}
                                    </label>
                                    <input
                                        type="number" min={0} step="0.01"
                                        className={cn(
                                            cellInputCls(false, 'right'),
                                            width,
                                            'h-7 border border-slate-300 bg-white focus:ring-2 focus:ring-inset focus:ring-primary',
                                        )}
                                        value={(value[field] as number) || ''}
                                        onChange={(e) => num(field, e.target.value)}
                                    />
                                </div>
                            ))}

                            <div className="flex items-center gap-1.5 border-l border-slate-300 pl-4">
                                <span className="text-xs text-slate-700 font-medium whitespace-nowrap">Landing Cost Floor:</span>
                                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                    ₹{landingRate.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
