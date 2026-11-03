'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import {
    FileSpreadsheet,
    Loader2,
    Calendar,
    RotateCcw,
    FileText,
    Receipt,
    Percent,
    AlertCircle,
    ArrowDownRight,
    RefreshCw,
    Coins,
} from 'lucide-react';
import { toast } from 'sonner';

import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter,
} from '@/components/ui/table';
import { useOutletId } from '@/hooks/useOutletId';
import { exportErpReport, getErpSalesReturnBook } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

// Currency formatter for Indian Numbering System
function formatCurrency(val: number | null | undefined): string {
    const num = Number(val || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesReturnBookPage() {
    const outletId = useOutletId();

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');

    // 1. State Hooks
    const [formatMode, setFormatMode] = useState<'detailed' | 'summarised'>('detailed');
    const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
        from: startOfMonthStr,
        to: todayStr,
    });
    const [isDownloading, setIsDownloading] = useState<boolean>(false);

    // 2. Data Fetching Hook via React Query
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['reports', 'erp-sales-return-book', outletId, formatMode, dateRange.from, dateRange.to],
        queryFn: async () => {
            if (!outletId) return null;
            return await getErpSalesReturnBook(outletId, {
                format: formatMode,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });
        },
        enabled: Boolean(outletId && dateRange.from && dateRange.to),
    });

    // 3. Preset Date Range Switcher
    const handlePresetChange = (preset: 'today' | 'this_month' | 'last_month' | 'this_year') => {
        const currentDate = new Date();
        if (preset === 'today') {
            const today = format(currentDate, 'yyyy-MM-dd');
            setDateRange({ from: today, to: today });
        } else if (preset === 'this_month') {
            setDateRange({
                from: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
                to: format(currentDate, 'yyyy-MM-dd'),
            });
        } else if (preset === 'last_month') {
            const prevMonth = subMonths(currentDate, 1);
            setDateRange({
                from: format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
                to: format(endOfMonth(prevMonth), 'yyyy-MM-dd'),
            });
        } else if (preset === 'this_year') {
            setDateRange({
                from: format(startOfYear(currentDate), 'yyyy-MM-dd'),
                to: format(currentDate, 'yyyy-MM-dd'),
            });
        }
    };

    // 4. Excel Download Handler
    const handleDownloadExcel = async () => {
        if (!outletId) {
            toast.error('No outlet selected. Please choose an active outlet.');
            return;
        }

        if (!dateRange.from || !dateRange.to) {
            toast.error('Please specify both a start date and an end date.');
            return;
        }

        if (dateRange.from > dateRange.to) {
            toast.error('Start date cannot be after end date.');
            return;
        }

        setIsDownloading(true);
        const toastId = toast.loading('Generating Marg ERP Sales Return Excel spreadsheet...');

        try {
            const blob = await exportErpReport(outletId, {
                reportType: 'sales-return-book',
                format: formatMode,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const modeLabel = formatMode === 'detailed' ? 'Detailed' : 'Summarised';
            a.download = `Sales_Return_Book_${modeLabel}_${dateRange.from}_to_${dateRange.to}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Excel spreadsheet downloaded successfully', { id: toastId });
        } catch (err: any) {
            console.error('Failed to export ERP Sales Return Book:', err);
            toast.error(err?.message || 'Failed to download report. Please try again.', { id: toastId });
        } finally {
            setIsDownloading(false);
        }
    };

    const rows = data?.rows || [];
    const summary = data?.summary || {
        total_taxable: 0,
        total_tax_5: 0,
        total_tax_12: 0,
        total_tax_18: 0,
        total_tax_28: 0,
        total_gst: 0,
        total_exempted: 0,
        total_round_off: 0,
        total_net_returns: 0,
        return_count: 0,
    };

    // Parameter Bar: Date controls, mode toggle, and refresh
    const parameterBar = (
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Date Range Inputs */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
                <Calendar className="w-4 h-4 text-slate-400 ml-1.5" />
                <Input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                    className="h-7 w-32 border-none p-1 text-xs focus-visible:ring-0 shadow-none font-medium"
                />
                <span className="text-slate-300 text-xs select-none">to</span>
                <Input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                    className="h-7 w-32 border-none p-1 text-xs focus-visible:ring-0 shadow-none font-medium"
                />
            </div>

            {/* Quick Presets */}
            <div className="hidden lg:flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePresetChange('today')}
                    className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                >
                    Today
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePresetChange('this_month')}
                    className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                >
                    This Month
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePresetChange('last_month')}
                    className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                >
                    Last Month
                </Button>
            </div>

            {/* Mode Toggle (Detailed vs Summarised) */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                    type="button"
                    onClick={() => setFormatMode('detailed')}
                    className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                        formatMode === 'detailed'
                            ? "bg-slate-900 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                    )}
                >
                    Detailed
                </button>
                <button
                    type="button"
                    onClick={() => setFormatMode('summarised')}
                    className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                        formatMode === 'summarised'
                            ? "bg-slate-900 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                    )}
                >
                    Summarised
                </button>
            </div>

            {/* Refresh Button */}
            <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8 p-0 bg-white border-slate-200 shadow-2xs"
                title="Refresh Report Data"
            >
                <RefreshCw className={cn("w-3.5 h-3.5 text-slate-600", isFetching && "animate-spin")} />
            </Button>
        </div>
    );

    // Export Actions: Excel Download Button
    const exportActions = (
        <Button
            onClick={handleDownloadExcel}
            disabled={isDownloading || isLoading || rows.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-2 shadow-xs transition-all"
        >
            {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>Download Excel</span>
        </Button>
    );

    const totalRefundAmount = summary.total_net_returns || summary.total_net_sales || 0;

    return (
        <ReportPageLayout
            title="Sales Return Book (Credit Notes)"
            description="Register of all refunded invoices with reversed GST tax slab breakdown."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Sales Return Book' },
            ]}
            parameterBar={parameterBar}
            exportActions={exportActions}
        >
            <div className="space-y-6">
                {/* 1. Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                    {/* Total Returns */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                            <span className="text-xs font-medium uppercase tracking-wider">Credit Notes</span>
                            <RotateCcw className="w-4 h-4 text-rose-500" />
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900">
                            {summary.return_count ?? rows.length}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Processed Returns</p>
                    </div>

                    {/* Total Refund Value */}
                    <div className="bg-rose-50/50 border border-rose-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between text-rose-600 mb-1">
                            <span className="text-xs font-medium uppercase tracking-wider">Total Refunded</span>
                            <ArrowDownRight className="w-4 h-4 text-rose-600" />
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-rose-600">
                            {formatCurrency(totalRefundAmount)}
                        </div>
                        <p className="text-[11px] text-rose-500/80 mt-1">Reversed Turnover</p>
                    </div>

                    {/* Taxable Amount Reversed */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                            <span className="text-xs font-medium uppercase tracking-wider">Taxable Reversal</span>
                            <Receipt className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900">
                            {formatCurrency(summary.total_taxable)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Excluding Tax</p>
                    </div>

                    {/* GST Liability Reversed */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                            <span className="text-xs font-medium uppercase tracking-wider">GST Reversed</span>
                            <Percent className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900">
                            {formatCurrency(summary.total_gst)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Output Tax Reversal</p>
                    </div>

                    {/* Exempted Value */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4 col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                            <span className="text-xs font-medium uppercase tracking-wider">Exempted</span>
                            <Coins className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900">
                            {formatCurrency(summary.total_exempted)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">0% GST Items</p>
                    </div>
                </div>

                {/* 2. Loading State */}
                {isLoading && (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-3" />
                        <p className="text-sm font-semibold text-slate-700">Loading Sales Return Book...</p>
                        <p className="text-xs text-slate-400 mt-1">Decomposing reversed GST tax slabs and credit notes.</p>
                    </div>
                )}

                {/* 3. Error State */}
                {isError && !isLoading && (
                    <div className="py-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
                        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                        <h3 className="text-sm font-bold">Failed to load sales return data</h3>
                        <p className="text-xs text-red-600 mt-1">{(error as any)?.message || 'Internal server error'}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            className="mt-4 border-red-300 text-red-700 hover:bg-red-100"
                        >
                            Retry
                        </Button>
                    </div>
                )}

                {/* 4. Empty State */}
                {!isLoading && !isError && rows.length === 0 && (
                    <div className="py-16 text-center">
                        <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-sm font-semibold text-slate-700">No Sales Returns Found</h3>
                        <p className="text-xs text-slate-400 mt-1">
                            No credit notes were issued in the selected date range ({dateRange.from} to {dateRange.to}).
                        </p>
                    </div>
                )}

                {/* 5. Data Table */}
                {!isLoading && !isError && rows.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto max-h-[600px]">
                            <Table className="text-xs">
                                <TableHeader className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-24 font-bold text-slate-700">Date</TableHead>
                                        {formatMode === 'detailed' ? (
                                            <>
                                                <TableHead className="w-36 font-bold text-slate-700">Return No</TableHead>
                                                <TableHead className="min-w-[140px] font-bold text-slate-700">Party Name</TableHead>
                                                <TableHead className="w-32 font-bold text-slate-700">GSTIN</TableHead>
                                            </>
                                        ) : (
                                            <TableHead className="w-28 text-right font-bold text-slate-700">Return Count</TableHead>
                                        )}
                                        <TableHead className="text-right font-bold text-slate-700">Taxable</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">5% Tax</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">12% Tax</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">18% Tax</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">28% Tax</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Total GST</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Exempted</TableHead>
                                        <TableHead className="text-right font-bold text-rose-700 bg-rose-100/60">Net Total</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {rows.map((row: any, idx: number) => (
                                        <TableRow
                                            key={`${row.date}-${row.return_no || row.bill_no || idx}`}
                                            className="transition-colors hover:bg-rose-50/30"
                                        >
                                            <TableCell className="font-mono text-slate-600">{row.date}</TableCell>
                                            {formatMode === 'detailed' ? (
                                                <>
                                                    <TableCell className="font-medium font-mono text-slate-800 flex items-center gap-1.5">
                                                        {row.return_no || row.bill_no}
                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase border-rose-300 text-rose-700 bg-rose-50">
                                                            Credit Note
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-medium text-slate-800 truncate max-w-[200px]" title={row.party_name}>
                                                        {row.party_name || 'Walk-in Customer'}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-slate-500">
                                                        {row.gstin || '-'}
                                                    </TableCell>
                                                </>
                                            ) : (
                                                <TableCell className="text-right font-medium text-slate-800 font-mono">
                                                    {row.return_count ?? row.bill_count}
                                                </TableCell>
                                            )}
                                            <TableCell className="text-right font-mono font-medium text-slate-700">
                                                {formatCurrency(row.taxable)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-slate-600">
                                                {formatCurrency(row.tax_5)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-slate-600">
                                                {formatCurrency(row.tax_12)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-slate-600">
                                                {formatCurrency(row.tax_18)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-slate-600">
                                                {formatCurrency(row.tax_28)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold text-slate-800">
                                                {formatCurrency(row.total_gst)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-slate-600">
                                                {formatCurrency(row.exempted)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-red-600 bg-rose-50/40">
                                                -{formatCurrency(row.net_total)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>

                                <TableFooter className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300 sticky bottom-0">
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={formatMode === 'detailed' ? 4 : 2} className="text-left font-bold text-slate-800 uppercase tracking-wider">
                                            Total ({rows.length} {formatMode === 'detailed' ? 'Returns' : 'Days'})
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-900">
                                            {formatCurrency(summary.total_taxable)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-800">
                                            {formatCurrency(summary.total_tax_5)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-800">
                                            {formatCurrency(summary.total_tax_12)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-800">
                                            {formatCurrency(summary.total_tax_18)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-800">
                                            {formatCurrency(summary.total_tax_28)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-900">
                                            {formatCurrency(summary.total_gst)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-800">
                                            {formatCurrency(summary.total_exempted)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-red-600 bg-rose-100/50">
                                            -{formatCurrency(totalRefundAmount)}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </div>
                )}
            </div>
        </ReportPageLayout>
    );
}
