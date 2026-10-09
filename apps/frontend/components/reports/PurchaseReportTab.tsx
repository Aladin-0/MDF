'use client';

import { useMemo, useState } from 'react';
import {
    AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer,
} from 'recharts';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DateRangeFilter, PurchaseReportRow } from '@/types';
import { usePurchaseReport } from '@/hooks/useReports';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const DIST_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444'];

const helper = createColumnHelper<PurchaseReportRow>();

function StatusBadge({ row }: { row: PurchaseReportRow }) {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (row.outstanding <= 0) {
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Paid</Badge>;
    }
    // Check overdue: no dueDate in PurchaseReportRow, so we derive from purchase data
    // For mock data where purchase-5 is 45 days old, we detect by date
    const daysSincePurchase = Math.floor((new Date(today).getTime() - new Date(row.date).getTime()) / 86400000);
    if (daysSincePurchase > 30 && row.outstanding > 0) {
        return <Badge className="bg-red-600 text-white hover:bg-red-600">Overdue</Badge>;
    }
    if (row.outstanding < row.grandTotal) {
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Partial</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Unpaid</Badge>;
}

interface PurchaseReportTabProps {
    dateRange: DateRangeFilter;
}

export function PurchaseReportTab({ dateRange }: PurchaseReportTabProps) {
    const { data, isLoading } = usePurchaseReport(dateRange);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);

    const rows = data?.rows ?? [];

    const distributorPie = useMemo(() => {
        const map = new Map<string, number>();
        rows.forEach((r: any) => {
            map.set(r.distributorName, (map.get(r.distributorName) ?? 0) + r.grandTotal);
        });
        return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    }, [rows]);

    const chartData = useMemo(() => {
        const map = new Map<string, number>();
        rows.forEach((r: any) => {
            if (!r.date) return;
            map.set(r.date, (map.get(r.date) ?? 0) + (r.grandTotal || 0));
        });
        return Array.from(map.entries())
            .map(([date, grandTotal]) => ({ date, grandTotal }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [rows]);

    const columns = [
        helper.accessor('date', {
            header: 'Date',
            cell: info => format(new Date(info.getValue()), 'd MMM yyyy'),
        }),
        helper.accessor('invoiceNo', { header: 'Invoice No' }),
        helper.accessor('distributorName', {
            header: 'Distributor',
            cell: info => (
                <span className="text-xs">{info.getValue()}</span>
            ),
        }),
        helper.accessor('itemCount', { header: 'Items' }),
        helper.accessor('grandTotal', {
            header: 'Total',
            cell: info => <span className="font-medium">{formatCurrency(info.getValue())}</span>,
        }),
        helper.accessor('amountPaid', {
            header: 'Paid',
            cell: info => (
                <span className="text-green-700 font-medium">{formatCurrency(info.getValue())}</span>
            ),
        }),
        helper.accessor('outstanding', {
            header: 'Outstanding',
            cell: info => (
                <span className={cn(
                    'font-medium',
                    info.getValue() > 0 ? 'text-red-600' : 'text-slate-400'
                )}>
                    {formatCurrency(info.getValue())}
                </span>
            ),
        }),
        helper.display({
            id: 'status',
            header: 'Status',
            cell: ({ row }) => <StatusBadge row={row.original} />,
        }),
    ];

    const table = useReactTable({
        data: rows,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center text-muted-foreground">Loading purchase data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Purchased</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(data?.totalPurchased ?? 0)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(data?.totalPaid ?? 0)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Outstanding</p>
                    <p className={cn('text-2xl font-bold', (data?.totalOutstanding ?? 0) > 0 ? 'text-red-600' : 'text-slate-400')}>
                        {formatCurrency(data?.totalOutstanding ?? 0)}
                    </p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Purchase Trend */}
                <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Purchase Trend</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="purchaseGradArtistic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feGaussianBlur stdDeviation="4" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={v => format(new Date(v), 'd MMM')}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                dx={-10}
                            />
                            <Tooltip
                                cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                formatter={(v) => formatCurrency(v as number)}
                                labelFormatter={v => format(new Date(v), 'd MMM yyyy')}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area
                                type="natural"
                                dataKey="grandTotal"
                                name="Total Purchased"
                                stroke="#6366f1"
                                fill="url(#purchaseGradArtistic)"
                                strokeWidth={3}
                                activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                                filter="url(#glow)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Distributor Breakup */}
                <div className="bg-white rounded-xl border p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Distributor Breakup</h3>
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                            <Pie
                                data={distributorPie}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={65}
                                dataKey="value"
                                label={({ name, percent }: { name?: string; percent?: number }) =>
                                    `${(name ?? '').split(' ')[0]} (${((percent ?? 0) * 100).toFixed(0)}%)`
                                }
                                labelLine={true}
                            >
                                {distributorPie.map((_: any, idx: number) => (
                                    <Cell key={idx} fill={DIST_COLORS[idx % DIST_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v) => formatCurrency(v as number)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Purchase Table */}
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
                        {rows.length === 0 && (
                            <tbody>
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                                        No purchases in selected period
                                    </td>
                                </tr>
                            </tbody>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
