'use client';

import { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { useStockValuation } from '@/hooks/useReports';
import { StockValuationRow } from '@/types';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';

const helper = createColumnHelper<StockValuationRow>();

export function StockValuationTab() {
    const { data, isLoading } = useStockValuation();
    const [sorting, setSorting] = useState<SortingState>([]);

    const topProducts = useMemo(() => {
        if (!data) return [];
        return [...data.rows]
            .sort((a, b) => b.stockValue - a.stockValue)
            .slice(0, 8)
            .map(r => ({
                name: r.productName.split(' ').slice(0, 2).join(' '),
                stockValue: r.stockValue,
                mrpValue: r.mrpValue,
            }));
    }, [data]);

    const columns = [
        helper.accessor('productName', {
            header: 'Product',
            cell: info => <span className="font-medium">{info.getValue()}</span>,
        }),
        helper.accessor('composition', {
            header: 'Composition',
            cell: info => (
                <span className="text-xs text-muted-foreground max-w-[180px] truncate block">
                    {info.getValue()}
                </span>
            ),
        }),
        helper.accessor('batchNo', { header: 'Batch' }),
        helper.accessor('expiryDate', {
            header: 'Expiry',
            cell: info => {
                const days = differenceInDays(new Date(info.getValue()), new Date());
                return (
                    <span className={cn(
                        'text-sm',
                        days < 90 ? 'text-red-600 font-semibold' :
                        days < 180 ? 'text-amber-600 font-semibold' :
                        'text-slate-700'
                    )}>
                        {info.getValue()}
                    </span>
                );
            },
        }),
        helper.accessor('qtyStrips', { header: 'Qty' }),
        helper.accessor('purchaseRate', {
            header: 'Pur. Rate',
            cell: info => `₹${info.getValue()}`,
        }),
        helper.accessor('mrp', {
            header: 'MRP',
            cell: info => `₹${info.getValue()}`,
        }),

        helper.accessor('stockValue', {
            header: 'Stock Value',
            cell: info => <span className="font-medium">{formatCurrency(info.getValue())}</span>,
        }),
        helper.accessor('mrpValue', {
            header: 'MRP Value',
            cell: info => <span className="font-medium text-green-700">{formatCurrency(info.getValue())}</span>,
        }),
    ];

    const table = useReactTable({
        data: data?.rows ?? [],
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading stock data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Total Stock Value
                    </p>
                    <p className="text-2xl font-bold text-slate-900">
                        {formatCurrency(data?.totalStockValue ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">At purchase rate</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Total MRP Value
                    </p>
                    <p className="text-2xl font-bold text-green-700">
                        {formatCurrency(data?.totalMrpValue ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">At MRP rate</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Potential Margin
                    </p>
                    <p className="text-2xl font-bold text-primary">
                        {data?.potentialMarginPct ?? 0}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">MRP vs purchase cost</p>
                </div>
            </div>

            {/* Horizontal Bar Chart - Top 8 Products */}
            <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Top 8 Products by Value</h3>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                        data={topProducts}
                        layout="vertical"
                        margin={{ left: 80, right: 20, top: 5, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                            type="number"
                            tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 10 }}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            width={80}
                        />
                        <Tooltip formatter={(v) => formatCurrency(v as number)} />
                        <Legend />
                        <Bar dataKey="stockValue" name="Stock Value" fill="#3b82f6" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="mrpValue" name="MRP Value" fill="#22c55e" radius={[0, 2, 2, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Stock Valuation Table */}
            <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            {table.getHeaderGroups().map(hg => (
                                <tr key={hg.id} className="bg-slate-50 border-b">
                                    {hg.headers.map(h => (
                                        <th
                                            key={h.id}
                                            className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none"
                                            onClick={h.column.getToggleSortingHandler()}
                                        >
                                            <div className="flex items-center gap-1">
                                                {flexRender(h.column.columnDef.header, h.getContext())}
                                                <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row, idx) => (
                                <tr
                                    key={row.id}
                                    className={cn('border-b hover:bg-slate-50', idx % 2 === 1 && 'bg-slate-50/50')}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {(data?.rows.length ?? 0) > 0 && (
                            <tfoot>
                                <tr className="bg-slate-900 text-white">
                                    <td className="px-3 py-2 font-bold text-xs" colSpan={8}>TOTALS</td>
                                    <td className="px-3 py-2 font-bold">{formatCurrency(data?.totalStockValue ?? 0)}</td>
                                    <td className="px-3 py-2 font-bold">{formatCurrency(data?.totalMrpValue ?? 0)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
