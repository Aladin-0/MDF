'use client';

import { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
    useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Trophy, ArrowUpDown } from 'lucide-react';
import { DateRangeFilter, StaffReportRow } from '@/types';
import { useStaffReport } from '@/hooks/useReports';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';

const RANK_STYLES = ['text-yellow-600', 'text-slate-500', 'text-amber-600'];
const RANK_LABELS = ['1st', '2nd', '3rd'];

const helper = createColumnHelper<StaffReportRow>();

interface StaffReportTabProps {
    dateRange: DateRangeFilter;
}

export function StaffReportTab({ dateRange }: StaffReportTabProps) {
    const { data, isLoading } = useStaffReport(dateRange);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'totalSales', desc: true }]);

    const sortedRows = useMemo(() => {
        if (!data) return [];
        return [...data].sort((a, b) => b.totalSales - a.totalSales);
    }, [data]);

    const topPerformer = sortedRows[0];

    const teamTotals = useMemo(() => ({
        bills: sortedRows.reduce((s, r) => s + r.billsCount, 0),
        sales: sortedRows.reduce((s, r) => s + r.totalSales, 0),
        avg: sortedRows.length > 0
            ? Math.round(sortedRows.reduce((s, r) => s + r.totalSales, 0) / sortedRows.length)
            : 0,
    }), [sortedRows]);

    const chartData = sortedRows.map(r => ({
        name: r.staffName.split(' ')[0],
        bills: r.billsCount,
        sales: r.totalSales,
    }));

    const columns = [
        helper.display({
            id: 'rank',
            header: 'Rank',
            cell: ({ row }) => {
                const rank = sortedRows.findIndex(r => r.staffId === row.original.staffId);
                return (
                    <span className={cn('font-bold text-sm', RANK_STYLES[rank] ?? 'text-slate-600')}>
                        {RANK_LABELS[rank] ?? `${rank + 1}th`}
                    </span>
                );
            },
        }),
        helper.accessor('staffName', {
            header: 'Name',
            cell: info => (
                <div>
                    <p className="font-medium">{info.getValue()}</p>
                    <p className="text-xs text-muted-foreground capitalize">{info.row.original.role.replace('_', ' ')}</p>
                </div>
            ),
        }),
        helper.accessor('billsCount', {
            header: 'Bills',
            cell: info => <span className="font-semibold">{info.getValue()}</span>,
        }),
        helper.accessor('totalSales', {
            header: 'Total Sales',
            cell: info => <span className="font-semibold">{formatCurrency(info.getValue())}</span>,
        }),
        helper.accessor('avgBillValue', {
            header: 'Avg Bill',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('totalDiscount', {
            header: 'Discount Given',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('avgDiscountPct', {
            header: 'Avg Disc%',
            cell: info => `${info.getValue()}%`,
        }),
        helper.accessor('cashBills', { header: 'Cash Bills' }),
        helper.accessor('creditBills', { header: 'Credit Bills' }),
    ];

    const table = useReactTable({
        data: sortedRows,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading staff data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Top performer + team summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topPerformer && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                        <Trophy className="w-8 h-8 text-yellow-500 mt-1 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold">Top Performer</p>
                            <p className="text-lg font-bold text-slate-900">{topPerformer.staffName}</p>
                            <p className="text-sm text-amber-700 mt-1">
                                {topPerformer.billsCount} bills · {formatCurrency(topPerformer.totalSales)}
                            </p>
                        </div>
                    </div>
                )}
                <div className="bg-white border rounded-xl p-4 grid grid-cols-3 gap-4">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Bills</p>
                        <p className="text-2xl font-bold">{teamTotals.bills}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Sales</p>
                        <p className="text-2xl font-bold">{formatCurrency(teamTotals.sales)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg / Staff</p>
                        <p className="text-2xl font-bold">{formatCurrency(teamTotals.avg)}</p>
                    </div>
                </div>
            </div>

            {/* Performance Chart */}
            <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Staff Performance</h3>
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis
                            yAxisId="bills"
                            orientation="left"
                            tick={{ fontSize: 11 }}
                        />
                        <YAxis
                            yAxisId="sales"
                            orientation="right"
                            tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                            formatter={(value, name) =>
                                name === 'sales'
                                    ? [formatCurrency(value as number), 'Sales']
                                    : [value, 'Bills']
                            }
                        />
                        <Legend />
                        <Bar yAxisId="bills" dataKey="bills" name="Bills" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                        <Bar yAxisId="sales" dataKey="sales" name="Sales" fill="#22c55e" radius={[2, 2, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Staff Table */}
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
                        {sortedRows.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-900 text-white">
                                    <td className="px-3 py-2 font-bold text-xs" colSpan={2}>TOTALS</td>
                                    <td className="px-3 py-2 font-bold">{teamTotals.bills}</td>
                                    <td className="px-3 py-2 font-bold">{formatCurrency(teamTotals.sales)}</td>
                                    <td className="px-3 py-2 font-bold">{formatCurrency(teamTotals.avg)}</td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                {sortedRows.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 text-sm">
                        <div className="text-slate-500">
                            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
