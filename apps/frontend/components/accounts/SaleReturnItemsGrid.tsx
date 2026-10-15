'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader2, Search } from 'lucide-react';
import { ReturnItemRow } from '@/hooks/useSaleReturnCart';
import { useProductSearch } from '@/hooks/useProductSearch';
import { ProductSearchResult } from '@/types';

export interface SaleReturnItemsGridProps {
    items: ReturnItemRow[];
    onUpdateItem: (id: string, field: keyof ReturnItemRow, value: string) => void;
    onUpdateItemMultiple?: (id: string, updates: Partial<ReturnItemRow>) => void;
    onAddItem?: () => void;
    onRemoveItem: (id: string) => void;
    mode?: 'new' | 'edit';
    readOnlyProductInfo?: boolean;
    allowAddItem?: boolean;
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
    const { data: searchResults = [], isFetching } = useProductSearch(query, 'purchase');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery(item.productName || '');
    }, [item.productName]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectProduct = (product: ProductSearchResult, batch?: any) => {
        const chosenBatch = batch || (product.batches && product.batches.length > 0 ? product.batches[0] : null);
        const updates: Partial<ReturnItemRow> = {
            productName: product.name,
            packSize: product.packSize || 1,
            gstRate: String(product.gstRate ?? 12),
            batchId: chosenBatch ? chosenBatch.id : '',
            batchNo: chosenBatch ? chosenBatch.batchNo : '',
            rate: chosenBatch && (chosenBatch.saleRate || chosenBatch.mrp)
                ? String(chosenBatch.saleRate || chosenBatch.mrp)
                : String(product.saleRate || product.mrp || ''),
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

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative flex items-center">
                <input
                    placeholder="Search medicine (e.g. Paracetamol)..."
                    value={query}
                    onFocus={() => { if (query.trim().length >= 2) setOpen(true); }}
                    onChange={(e) => {
                        const val = e.target.value;
                        setQuery(val);
                        onUpdateItem(item.id, 'productName', val);
                        if (val.trim().length >= 2) setOpen(true);
                        else setOpen(false);
                    }}
                    className="h-7 w-full text-xs font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1.5 transition-colors shadow-none outline-none pr-6"
                />
                {isFetching && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500 absolute right-1.5" />
                )}
            </div>

            {item.packSize > 1 && (
                <span className="inline-block text-[10px] text-slate-400 font-mono px-1.5">
                    Pack of {item.packSize}
                </span>
            )}

            {open && searchResults.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-96 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-2xl z-50 divide-y divide-slate-100">
                    {searchResults.map((product) => (
                        <div key={product.id} className="p-2.5 hover:bg-blue-50/70 transition-colors text-left cursor-pointer">
                            <div 
                                onClick={() => handleSelectProduct(product)}
                                className="font-semibold text-xs text-slate-900 flex justify-between items-center"
                            >
                                <span className="hover:text-blue-600 transition-colors">{product.name}</span>
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                    Pack {product.packSize || 1}
                                </span>
                            </div>
                            {product.composition && (
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">{product.composition}</p>
                            )}
                            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                                <span>{product.manufacturer || 'General'}</span>
                                <span className="font-semibold text-slate-700">MRP: ₹{product.mrp || 0}</span>
                            </div>

                            {/* Batches available */}
                            {product.batches && product.batches.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-1">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                        Batches:
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {product.batches.slice(0, 5).map((b) => (
                                            <button
                                                key={b.id}
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectProduct(product, b);
                                                }}
                                                className="text-[10px] font-mono bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                                            >
                                                {b.batchNo} · ₹{b.saleRate || b.mrp}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
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
    return (
        <div className="space-y-2 w-full">
            <div className="flex items-center justify-between px-0.5">
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

            {/* Dense High-Precision Table */}
            <div className="rounded-md border border-slate-200 overflow-x-auto bg-white shadow-xs w-full">
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
                        onClick={onAddItem}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                    >
                        <Plus className="h-3.5 w-3.5" /> Add manual item
                    </button>
                </div>
            )}
        </div>
    );
}
