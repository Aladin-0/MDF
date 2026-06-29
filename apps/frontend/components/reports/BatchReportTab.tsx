'use client';

import { useMemo, useState } from 'react';
import {
    useReactTable, getCoreRowModel, getSortedRowModel,
    flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { DateRangeFilter } from '@/types';
import { useBatchReport } from '@/hooks/useReports';
import { ReportSummaryCards } from './ReportSummaryCards';
import { formatCurrency } from '@/lib/gst';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const helper = createColumnHelper<any>();

interface BatchReportTabProps {
    dateRange: DateRangeFilter;
    filters: {
        reportType: string;
        search: string;
        expiryWithinDays: string;
    };
    onFiltersChange: (filters: any) => void;
}

export function BatchReportTab({ dateRange, filters, onFiltersChange }: BatchReportTabProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    
    // Fetch data using hook
    const queryFilters = {
        ...dateRange,
        report_type: filters.reportType,
        search: filters.search,
        expiry_within_days: filters.expiryWithinDays
    };
    
    const { data, isLoading } = useBatchReport(queryFilters);

    const rows = data?.data ?? [];

    const handleSearchChange = (val: string) => {
        onFiltersChange({ ...filters, search: val });
    };

    const columns = [
        helper.accessor('medicine_name', { header: 'Medicine' }),
        helper.accessor('batch_no', { header: 'Batch No' }),
        helper.accessor('expiry_date', {
            header: 'Expiry Date',
            cell: info => info.getValue() ? format(new Date(info.getValue()), 'MMM yyyy') : '-',
        }),
        helper.accessor('expiry_status', {
            header: 'Status',
            cell: info => {
                const status = info.getValue();
                return (
                    <span className={cn(
                        "px-2 py-1 text-xs font-bold rounded-md",
                        status === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                        status === 'NEAR_EXPIRY' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                    )}>
                        {status.replace('_', ' ')}
                    </span>
                )
            }
        }),
        helper.accessor('mrp', {
            header: 'MRP',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('purchase_rate', {
            header: 'Pur. Rate',
            cell: info => formatCurrency(info.getValue()),
        }),
        helper.accessor('opening_qty_display', {
            header: 'Opening',
            cell: info => info.getValue()?.text || '0',
        }),
        ...(filters.reportType === 'movement' ? [
            helper.accessor('purchased_qty_display', {
                header: 'Purchased',
                cell: info => info.getValue()?.text || '0',
            }),
            helper.accessor('sold_qty_display', {
                header: 'Sold',
                cell: info => info.getValue()?.text || '0',
            }),
            helper.accessor('adjustment_in_qty_raw', {
                header: 'Adjustments',
                cell: info => {
                    const row = info.row.original;
                    const adj = row.adjustment_in_qty_raw - row.adjustment_out_qty_raw;
                    if (adj === 0) return '0';
                    return adj > 0 ? `+${adj}` : `${adj}`;
                },
            }),
        ] : []),
        helper.accessor('closing_qty_display', {
            header: 'Closing',
            cell: info => <span className="font-bold">{info.getValue()?.text || '0'}</span>,
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

    const summaryCards = [
        { label: 'Total Batches', value: data?.summary?.total_batches || 0 },
        { label: 'Active', value: data?.summary?.total_active_batches || 0 },
        { label: 'Near Expiry', value: data?.summary?.total_near_expiry_batches || 0 },
        { label: 'Expired', value: data?.summary?.total_expired_batches || 0 },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-xl border">
                <div className="w-48">
                    <Select value={filters.reportType} onValueChange={v => onFiltersChange({...filters, reportType: v})}>
                        <SelectTrigger>
                            <SelectValue placeholder="Report Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="current_stock">Current Stock</SelectItem>
                            <SelectItem value="movement">Movement</SelectItem>
                            <SelectItem value="near_expiry">Near Expiry</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                            <SelectItem value="zero_stock">Zero Stock</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                {filters.reportType === 'near_expiry' && (
                    <div className="w-32">
                        <Select value={filters.expiryWithinDays} onValueChange={v => onFiltersChange({...filters, expiryWithinDays: v})}>
                            <SelectTrigger>
                                <SelectValue placeholder="Days" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30">30 Days</SelectItem>
                                <SelectItem value="60">60 Days</SelectItem>
                                <SelectItem value="90">90 Days</SelectItem>
                                <SelectItem value="180">180 Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
                
                <div className="flex-1 flex gap-2">
                    <Input 
                        placeholder="Search medicine or batch..." 
                        value={filters.search}
                        onChange={e => handleSearchChange(e.target.value)}
                    />
                </div>
            </div>

            <ReportSummaryCards cards={summaryCards} isLoading={isLoading} />

            <div className="bg-white rounded-xl border overflow-x-auto">
                {isLoading ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">Loading batch data...</div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                            {table.getHeaderGroups().map(hg => (
                                <tr key={hg.id}>
                                    {hg.headers.map(h => (
                                        <th key={h.id} className="px-4 py-3 whitespace-nowrap" onClick={h.column.getToggleSortingHandler()}>
                                            {flexRender(h.column.columnDef.header, h.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y text-slate-700">
                            {table.getRowModel().rows.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50/50">
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                                        No batches found matching the current filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
