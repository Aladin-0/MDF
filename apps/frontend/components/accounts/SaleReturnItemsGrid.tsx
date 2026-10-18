'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Loader2, Search, Check, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ReturnItemRow } from '@/hooks/useSaleReturnCart';
import { useProductSearch } from '@/hooks/useProductSearch';
import { ProductSearchResult } from '@/types';
import { cn } from '@/lib/utils';

export interface SaleReturnItemsGridProps {
    items: ReturnItemRow[];
    onUpdateItem: (id: string, field: keyof ReturnItemRow, value: string) => void;
    onUpdateItemMultiple?: (id: string, updates: Partial<ReturnItemRow>) => void;
    onAddItem?: (item?: Partial<ReturnItemRow>) => void;
    onRemoveItem: (id: string) => void;
    mode?: 'new' | 'edit';
    readOnlyProductInfo?: boolean;
    allowAddItem?: boolean;
}

function formatExpiryDate(d?: string) {
    if (!d) return '';
    try {
        return format(new Date(d), 'MM/yy');
    } catch {
        return d;
    }
}

function RowProductSearch({
    item,
    onUpdateItem,
    onUpdateItemMultiple,
}: {
    item: ReturnItemRow;
    onUpdateItem: (id: string, field: keyof ReturnItemRow, value: string) => void;
    onUpdateItemMultiple?: (id: string, updates: Partial<ReturnItemRow>) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(item.productName || '');
    const [mounted, setMounted] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [dropdownStyle, setDropdownStyle] = useState<{
        top: number;
        left: number;
        width: number;
        maxHeight: number;
    } | null>(null);

    const { data: searchResults = [], isFetching } = useProductSearch(query, 'purchase');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        setQuery(item.productName || '');
    }, [item.productName]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [searchResults]);

    const updatePosition = () => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const showAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
        const maxHeight = showAbove ? Math.min(320, spaceAbove - 16) : Math.min(360, spaceBelow - 20);
        const top = showAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4;
        const left = Math.max(10, Math.min(rect.left, window.innerWidth - 460));

        setDropdownStyle({
            top,
            left,
            width: Math.max(rect.width, 450),
            maxHeight,
        });
    };

    useEffect(() => {
        if (!open) return;
        updatePosition();

        const handleScrollOrResize = () => updatePosition();
        document.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            document.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [open]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                portalRef.current && !portalRef.current.contains(target)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectProduct = (product: ProductSearchResult, batch?: any) => {
        const chosenBatch = batch || (product.batches && product.batches.length > 0 ? product.batches[0] : null);
        const rateVal = chosenBatch && (chosenBatch.saleRate || chosenBatch.mrp)
            ? String(chosenBatch.saleRate || chosenBatch.mrp)
            : String(product.saleRate || product.mrp || '');

        const currentStrips = item.qtyStrips;
        const currentLoose = item.qtyLoose;
        const newStrips = (!currentStrips || currentStrips === '0') && (!currentLoose || currentLoose === '0') ? '1' : currentStrips;

        const updates: Partial<ReturnItemRow> = {
            productName: product.name,
            packSize: chosenBatch?.packSize || product.packSize || 1,
            gstRate: String(product.gstRate ?? 12),
            batchId: chosenBatch ? chosenBatch.id : '',
            batchNo: chosenBatch ? chosenBatch.batchNo : '',
            rate: rateVal,
            qtyStrips: newStrips,
            qtyLoose: currentLoose || '0',
            maxTotalUnits: 999999,
        };

        if (onUpdateItemMultiple) {
            onUpdateItemMultiple(item.id, updates);
        } else {
            Object.entries(updates).forEach(([k, v]) => onUpdateItem(item.id, k as any, String(v)));
        }
        setQuery(product.name);
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!open || searchResults.length === 0) {
            if (e.key === 'ArrowDown' && query.trim().length >= 2) {
                setOpen(true);
                updatePosition();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResults[highlightedIndex]) {
                handleSelectProduct(searchResults[highlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    placeholder="Search medicine (e.g. Paracetamol)..."
                    value={query}
                    onFocus={() => {
                        if (query.trim().length >= 2) {
                            setOpen(true);
                            updatePosition();
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    onChange={(e) => {
                        const val = e.target.value;
                        setQuery(val);
                        onUpdateItem(item.id, 'productName', val);
                        if (val.trim().length >= 2) {
                            setOpen(true);
                            updatePosition();
                        } else {
                            setOpen(false);
                        }
                    }}
                    className="h-7 w-full text-xs font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1.5 transition-colors shadow-none outline-none pr-6"
                />
                {isFetching && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500 absolute right-1.5 pointer-events-none" />
                )}
            </div>

            {item.packSize > 1 && (
                <span className="inline-block text-[10px] text-slate-400 font-mono px-1.5">
                    Pack of {item.packSize}
                </span>
            )}

            {mounted && open && query.trim().length >= 2 && dropdownStyle && createPortal(
                <div
                    ref={portalRef}
                    className="fixed z-[99999] rounded-xl border border-slate-200 bg-white/98 backdrop-blur-md shadow-2xl overflow-y-auto divide-y divide-slate-100 ring-1 ring-black/10 animate-in fade-in-50 zoom-in-95 duration-100"
                    style={{
                        top: `${dropdownStyle.top}px`,
                        left: `${dropdownStyle.left}px`,
                        width: `${dropdownStyle.width}px`,
                        maxHeight: `${dropdownStyle.maxHeight}px`,
                    }}
                >
                    {isFetching && searchResults.length === 0 ? (
                        <div className="flex items-center justify-center gap-2 p-5 text-xs font-medium text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            <span>Searching medicines...</span>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <div className="p-4 text-center">
                            <p className="text-xs font-semibold text-slate-700">No medicines found for &ldquo;{query}&rdquo;</p>
                            <p className="text-[11px] text-slate-400 mt-1">You can continue typing to save custom medicine details manually.</p>
                        </div>
                    ) : (
                        searchResults.map((product, idx) => {
                            const isHighlighted = idx === highlightedIndex;
                            return (
                                <div
                                    key={product.id}
                                    className={cn(
                                        "p-2.5 transition-colors text-left cursor-pointer",
                                        isHighlighted ? "bg-blue-50/90" : "hover:bg-slate-50/80"
                                    )}
                                    onMouseEnter={() => setHighlightedIndex(idx)}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectProduct(product);
                                    }}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <div className="font-bold text-xs text-slate-900 hover:text-blue-600 transition-colors truncate">
                                                {product.name}
                                            </div>
                                            {product.composition && (
                                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                    {product.composition}
                                                </p>
                                            )}
                                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                                                <span>{product.manufacturer || 'General'}</span>
                                                <span>•</span>
                                                <span className={cn("font-medium", (product.totalStock || 0) > 0 ? "text-emerald-600" : "text-slate-400")}>
                                                    Stock: {product.totalStock || 0}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs font-bold text-slate-800">
                                                MRP: ₹{product.mrp || 0}
                                            </div>
                                            <span className="inline-block text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5">
                                                Pack {product.packSize || 1}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Batches available */}
                                    {product.batches && product.batches.length > 0 && (
                                        <div className="mt-2 pt-1.5 border-t border-slate-100">
                                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                                Available Batches:
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {product.batches.slice(0, 6).map((b: any) => (
                                                    <button
                                                        key={b.id}
                                                        type="button"
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            handleSelectProduct(product, b);
                                                        }}
                                                        className="text-[10px] font-mono bg-blue-50/80 hover:bg-blue-600 hover:text-white text-blue-800 px-2 py-0.5 rounded border border-blue-200 transition-colors flex items-center gap-1 font-medium shadow-2xs"
                                                    >
                                                        <span>{b.batchNo}</span>
                                                        {b.expiryDate && (
                                                            <span className="opacity-75">· {formatExpiryDate(b.expiryDate)}</span>
                                                        )}
                                                        <span>· ₹{b.saleRate || b.mrp}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

export function SaleReturnItemsGrid({
    items,
    onUpdateItem,
    onUpdateItemMultiple,
    onAddItem,
    onRemoveItem,
    mode = 'new',
    readOnlyProductInfo = false,
    allowAddItem = true,
}: SaleReturnItemsGridProps) {
    const [quickQuery, setQuickQuery] = useState('');
    const [quickOpen, setQuickOpen] = useState(false);
    const [quickHighlightedIndex, setQuickHighlightedIndex] = useState(0);
    const { data: quickResults = [], isFetching: isQuickFetching } = useProductSearch(quickQuery, 'purchase');
    const quickInputRef = useRef<HTMLInputElement>(null);
    const quickContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (quickContainerRef.current && !quickContainerRef.current.contains(e.target as Node)) {
                setQuickOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setQuickHighlightedIndex(0);
    }, [quickResults]);

    const handleSelectQuickProduct = (product: ProductSearchResult, batch?: any) => {
        const chosenBatch = batch || (product.batches && product.batches.length > 0 ? product.batches[0] : null);
        const rateVal = chosenBatch && (chosenBatch.saleRate || chosenBatch.mrp)
            ? String(chosenBatch.saleRate || chosenBatch.mrp)
            : String(product.saleRate || product.mrp || '');

        const newRowData: Partial<ReturnItemRow> = {
            productName: product.name,
            packSize: chosenBatch?.packSize || product.packSize || 1,
            gstRate: String(product.gstRate ?? 12),
            batchId: chosenBatch ? chosenBatch.id : '',
            batchNo: chosenBatch ? chosenBatch.batchNo : '',
            rate: rateVal,
            qtyStrips: '1',
            qtyLoose: '0',
            maxTotalUnits: 999999,
        };

        // If the table currently only has 1 empty item, populate it instead of appending
        const firstItem = items[0];
        const isFirstItemEmpty = items.length === 1 && !firstItem.productName && !firstItem.batchNo;

        if (isFirstItemEmpty) {
            if (onUpdateItemMultiple) {
                onUpdateItemMultiple(firstItem.id, newRowData);
            } else {
                Object.entries(newRowData).forEach(([k, v]) => onUpdateItem(firstItem.id, k as any, String(v)));
            }
        } else if (onAddItem) {
            onAddItem(newRowData);
        }

        setQuickQuery('');
        setQuickOpen(false);
    };

    const handleQuickKeyDown = (e: React.KeyboardEvent) => {
        if (!quickOpen || quickResults.length === 0) {
            if (e.key === 'ArrowDown' && quickQuery.trim().length >= 2) {
                setQuickOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setQuickHighlightedIndex((prev) => (prev + 1) % quickResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setQuickHighlightedIndex((prev) => (prev - 1 + quickResults.length) % quickResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (quickResults[quickHighlightedIndex]) {
                handleSelectQuickProduct(quickResults[quickHighlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setQuickOpen(false);
        }
    };

    return (
        <div className="space-y-3 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Return Items Matrix</span>
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-mono">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                </div>
                {mode === 'edit' && (
                    <span className="text-[11px] font-medium text-slate-500">
                        Live recalculation with exact invoice GST rates
                    </span>
                )}
            </div>

            {/* Quick Medicine Search Bar (Manual Billing Mode) */}
            {allowAddItem && onAddItem && !readOnlyProductInfo && (
                <div ref={quickContainerRef} className="relative w-full">
                    <div className="relative flex items-center">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                        <input
                            ref={quickInputRef}
                            type="text"
                            placeholder="🔍 Type medicine name to quickly add to return (e.g. Paracetamol, Augmentin)..."
                            value={quickQuery}
                            onFocus={() => { if (quickQuery.trim().length >= 2) setQuickOpen(true); }}
                            onKeyDown={handleQuickKeyDown}
                            onChange={(e) => {
                                const val = e.target.value;
                                setQuickQuery(val);
                                if (val.trim().length >= 2) setQuickOpen(true);
                                else setQuickOpen(false);
                            }}
                            className="w-full h-10 pl-9 pr-10 text-xs sm:text-sm font-medium bg-blue-50/40 border border-blue-200 rounded-lg shadow-2xs hover:border-blue-300 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                        />
                        {isQuickFetching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500 pointer-events-none" />
                        )}
                    </div>

                    {/* Quick Search Floating Dropdown */}
                    {quickOpen && quickQuery.trim().length >= 2 && (
                        <div className="absolute top-full left-0 z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl overflow-y-auto max-h-72 divide-y divide-slate-100 ring-1 ring-black/5">
                            {isQuickFetching && quickResults.length === 0 ? (
                                <div className="flex items-center justify-center gap-2 p-5 text-xs text-slate-500">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                    <span>Searching medicines catalog...</span>
                                </div>
                            ) : quickResults.length === 0 ? (
                                <div className="p-4 text-center">
                                    <p className="text-xs font-semibold text-slate-700">No medicines found for &ldquo;{quickQuery}&rdquo;</p>
                                    <p className="text-[11px] text-slate-400 mt-1">You can add an item directly into the table below.</p>
                                </div>
                            ) : (
                                quickResults.map((product, idx) => {
                                    const isHighlighted = idx === quickHighlightedIndex;
                                    return (
                                        <div
                                            key={product.id}
                                            className={cn(
                                                "p-3 transition-colors text-left cursor-pointer",
                                                isHighlighted ? "bg-blue-50/90" : "hover:bg-slate-50"
                                            )}
                                            onMouseEnter={() => setQuickHighlightedIndex(idx)}
                                            onClick={() => handleSelectQuickProduct(product)}
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div>
                                                    <span className="font-bold text-xs sm:text-sm text-slate-900 hover:text-blue-600 transition-colors">
                                                        {product.name}
                                                    </span>
                                                    {product.composition && (
                                                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">
                                                            {product.composition}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                                        <span>{product.manufacturer || 'General'}</span>
                                                        <span>•</span>
                                                        <span className={cn("font-medium", (product.totalStock || 0) > 0 ? "text-emerald-600" : "text-slate-400")}>
                                                            Stock: {product.totalStock || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-xs sm:text-sm font-bold text-slate-800">
                                                        MRP: ₹{product.mrp || 0}
                                                    </div>
                                                    <span className="inline-block text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded mt-1">
                                                        Pack {product.packSize || 1}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Batches Pill Selector */}
                                            {product.batches && product.batches.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-slate-100">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                                        Click Batch to Add:
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {product.batches.slice(0, 8).map((b: any) => (
                                                            <button
                                                                key={b.id}
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectQuickProduct(product, b);
                                                                }}
                                                                className="text-[11px] font-mono bg-blue-50/80 hover:bg-blue-600 hover:text-white text-blue-800 px-2.5 py-0.5 rounded border border-blue-200 transition-colors flex items-center gap-1 font-medium shadow-2xs"
                                                            >
                                                                <span>{b.batchNo}</span>
                                                                {b.expiryDate && (
                                                                    <span className="opacity-75">· {formatExpiryDate(b.expiryDate)}</span>
                                                                )}
                                                                <span>· ₹{b.saleRate || b.mrp}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Dense High-Precision Table */}
            <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white shadow-2xs w-full">
                <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead className="bg-slate-200 sticky top-0 z-10 shadow-xs border-b border-slate-300">
                        <tr>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-10 text-center border-r border-slate-300">
                                #
                            </th>
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-r border-slate-300 w-full min-w-[260px]">
                                Product &amp; Pack Details
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-28 text-center border-r border-slate-300">
                                Batch
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20 text-right border-r border-slate-300">
                                Strips
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20 text-right border-r border-slate-300">
                                Loose
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-24 text-right border-r border-slate-300">
                                Rate ₹
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16 text-right border-r border-slate-300">
                                GST %
                            </th>
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-28 text-right border-r border-slate-300">
                                Total ₹
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-10 text-center">
                                Act
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-3 py-8 text-center text-xs text-slate-400 font-medium">
                                    No items in return list. Search an invoice or add an item to begin.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, index) => (
                                <tr key={item.id} className="hover:bg-blue-50/40 transition-colors group">
                                    {/* Row Index */}
                                    <td className="px-2 py-1.5 text-[11px] font-bold text-slate-400 text-center border-r border-slate-100">
                                        {index + 1}
                                    </td>

                                    {/* Product Name */}
                                    <td className="px-2.5 py-1.5 border-r border-slate-100">
                                        {readOnlyProductInfo ? (
                                            <div>
                                                <div className="font-bold text-[12.5px] text-slate-800 leading-tight">
                                                    {item.productName || '—'}
                                                </div>
                                                {item.packSize > 1 && (
                                                    <span className="inline-block text-[10px] text-slate-500 font-mono mt-0.5">
                                                        Pack of {item.packSize}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <RowProductSearch
                                                item={item}
                                                onUpdateItem={onUpdateItem}
                                                onUpdateItemMultiple={onUpdateItemMultiple}
                                            />
                                        )}
                                    </td>

                                    {/* Batch */}
                                    <td className="px-2 py-1.5 text-center border-r border-slate-100">
                                        {readOnlyProductInfo ? (
                                            <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                                {item.batchNo || '—'}
                                            </span>
                                        ) : (
                                            <input
                                                placeholder="Batch #"
                                                value={item.batchNo || ''}
                                                onChange={(e) => onUpdateItem(item.id, 'batchNo', e.target.value)}
                                                className="h-7 w-24 text-center font-mono text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1 transition-colors outline-none"
                                            />
                                        )}
                                    </td>

                                    {/* Strips Input */}
                                    <td className="px-1.5 py-1 border-r border-slate-100">
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            value={item.qtyStrips}
                                            onChange={(e) => onUpdateItem(item.id, 'qtyStrips', e.target.value)}
                                            className="h-7 w-full text-right font-mono text-xs font-bold text-blue-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 transition-colors shadow-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    </td>

                                    {/* Loose Input */}
                                    <td className="px-1.5 py-1 border-r border-slate-100">
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            value={item.qtyLoose}
                                            onChange={(e) => onUpdateItem(item.id, 'qtyLoose', e.target.value)}
                                            className="h-7 w-full text-right font-mono text-xs font-bold text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 transition-colors shadow-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    </td>

                                    {/* Rate Input */}
                                    <td className="px-1.5 py-1 text-right border-r border-slate-100">
                                        {readOnlyProductInfo ? (
                                            <span className="text-slate-700 font-mono text-xs font-semibold px-2 block">
                                                ₹{Number(item.rate || 0).toFixed(2)}
                                            </span>
                                        ) : (
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={item.rate}
                                                onChange={(e) => onUpdateItem(item.id, 'rate', e.target.value)}
                                                className="h-7 w-full text-right font-mono text-xs font-semibold text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-2 transition-colors shadow-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                        )}
                                    </td>

                                    {/* GST Rate */}
                                    <td className="px-1.5 py-1 text-right border-r border-slate-100">
                                        {readOnlyProductInfo ? (
                                            <span className="text-slate-600 font-mono text-xs px-2 block">
                                                {item.gstRate || 0}%
                                            </span>
                                        ) : (
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                placeholder="0"
                                                value={item.gstRate}
                                                onChange={(e) => onUpdateItem(item.id, 'gstRate', e.target.value)}
                                                className="h-7 w-full text-right font-mono text-xs text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1.5 transition-colors shadow-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                        )}
                                    </td>

                                    {/* Line Total */}
                                    <td className="px-3 py-1.5 text-right font-mono font-bold text-xs text-slate-900 border-r border-slate-100">
                                        ₹{(item.total || 0).toFixed(2)}
                                    </td>

                                    {/* Action */}
                                    <td className="px-1.5 py-1.5 text-center">
                                        <button
                                            type="button"
                                            onClick={() => onRemoveItem(item.id)}
                                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                            title="Remove item"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 mx-auto" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {allowAddItem && onAddItem && (
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={() => onAddItem()}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                    >
                        <Plus className="h-3.5 w-3.5" /> Add manual item
                    </button>
                </div>
            )}
        </div>
    );
}
