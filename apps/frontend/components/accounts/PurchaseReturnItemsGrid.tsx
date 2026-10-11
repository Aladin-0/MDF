'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PurchaseReturnItemRow } from '@/hooks/usePurchaseReturnCart';

export interface PurchaseReturnItemsGridProps {
    items: PurchaseReturnItemRow[];
    onUpdateItem: (id: string, field: keyof PurchaseReturnItemRow, value: string) => void;
    onAddItem?: () => void;
    onRemoveItem: (id: string) => void;
    mode?: 'new' | 'edit';
    readOnlyProductInfo?: boolean;
    allowAddItem?: boolean;
}

const RETURN_REASONS = [
    { value: 'damaged', label: 'Damaged Pack' },
    { value: 'expired', label: 'Expired / Near Exp' },
    { value: 'wrong_item', label: 'Wrong Supply' },
    { value: 'excess', label: 'Overstock' },
    { value: 'recall', label: 'Recall' },
    { value: 'correction', label: 'Correction' },
];

export function PurchaseReturnItemsGrid({
    items,
    onUpdateItem,
    onAddItem,
    onRemoveItem,
    mode = 'new',
    readOnlyProductInfo = false,
    allowAddItem = true,
}: PurchaseReturnItemsGridProps) {
    return (
        <div className="space-y-2 w-full">
            <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Debit Note Items Matrix</span>
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-mono">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                </div>
                {mode === 'edit' && (
                    <span className="text-[11px] font-medium text-slate-500">
                        Live recalculation with exclusive GST rates
                    </span>
                )}
            </div>

            {/* Dense High-Precision Table */}
            <div className="rounded-md border border-slate-200 overflow-x-auto bg-white shadow-xs w-full">
                <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead className="bg-slate-200 sticky top-0 z-10 shadow-xs border-b border-slate-300">
                        <tr>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-10 text-center border-r border-slate-300">
                                #
                            </th>
                            <th className="px-3 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-r border-slate-300 w-full min-w-[240px]">
                                Product Details
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-28 text-center border-r border-slate-300">
                                Batch / Exp
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
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-36 text-left border-r border-slate-300">
                                Reason
                            </th>
                            <th className="px-2 py-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider w-10 text-center">
                                Act
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-3 py-8 text-center text-xs text-slate-400 font-medium">
                                    No items in debit note list. Link an invoice or add an item to begin.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, index) => (
                                <tr key={item.id} className="hover:bg-blue-50/40 transition-colors group">
                                    {/* Row Index */}
                                    <td className="px-2 py-1.5 text-[11px] font-bold text-slate-400 text-center border-r border-slate-100">
                                        {index + 1}
                                    </td>

                                    {/* Product Details */}
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
                                            <div className="space-y-0.5">
                                                <input
                                                    placeholder="Product name"
                                                    value={item.productName}
                                                    onChange={(e) => onUpdateItem(item.id, 'productName', e.target.value)}
                                                    className="h-7 w-full text-xs font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1.5 transition-colors shadow-none outline-none"
                                                />
                                                {item.packSize > 1 && (
                                                    <span className="inline-block text-[10px] text-slate-400 font-mono px-1.5">
                                                        Pack of {item.packSize}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* Batch & Expiry */}
                                    <td className="px-2 py-1.5 text-center border-r border-slate-100">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                                                {item.batchNo || '—'}
                                            </span>
                                            {item.expiryDate && (
                                                <span className="text-[9.5px] text-slate-400 font-mono mt-0.5">
                                                    Exp {item.expiryDate}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Strips */}
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

                                    {/* Loose */}
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

                                    {/* Rate */}
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
                                                placeholder="12"
                                                value={item.gstRate}
                                                onChange={(e) => onUpdateItem(item.id, 'gstRate', e.target.value)}
                                                className="h-7 w-full text-right font-mono text-xs text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1.5 transition-colors shadow-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                        )}
                                    </td>

                                    {/* Total Amount */}
                                    <td className="px-3 py-1.5 text-right font-mono font-bold text-xs text-slate-900 border-r border-slate-100">
                                        ₹{item.total.toFixed(2)}
                                    </td>

                                    {/* Reason Select */}
                                    <td className="px-1.5 py-1 border-r border-slate-100">
                                        <select
                                            value={item.reason || 'damaged'}
                                            onChange={(e) => onUpdateItem(item.id, 'reason', e.target.value)}
                                            className="h-7 w-full rounded border border-transparent hover:border-slate-300 focus:border-blue-500 bg-transparent px-1.5 text-[11px] font-medium text-slate-700 outline-none transition-colors"
                                        >
                                            {RETURN_REASONS.map((r) => (
                                                <option key={r.value} value={r.value}>
                                                    {r.label}
                                                </option>
                                            ))}
                                        </select>
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
