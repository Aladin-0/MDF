'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import {
    FileSpreadsheet,
    Loader2,
    Calendar,
    RotateCcw,
    TrendingUp,
    FileText,
    Receipt,
    Percent,
    AlertCircle,
    ArrowDownRight,
    RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { exportErpReport, getErpSalesBook } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

// Helper to format currency in Indian Numbering System
function formatCurrency(val: number | null | undefined): string {
    const num = Number(val || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesBookPage() {
    const outletId = useOutletId();

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');

    // 1. State Hooks
    const [formatMode, setFormatMode] = useState<'detailed' | 'summarised'>('detailed');
    const [lessReturns, setLessReturns] = useState<boolean>(true);
    const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
        from: startOfMonthStr,
        to: todayStr,
    });
    const [isDownloading, setIsDownloading] = useState<boolean>(false);

    // 2. Data Fetching Hook via React Query
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['reports', 'erp-sales-book', outletId, formatMode, lessReturns, dateRange.from, dateRange.to],
        queryFn: async () => {
            if (!outletId) return null;
            return await getErpSalesBook(outletId, {
                format: formatMode,
                lessReturns,
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
        const toastId = toast.loading('Generating Marg ERP Excel spreadsheet...');

        try {
            const blob = await exportErpReport(outletId, {
                reportType: 'sales-book',
                format: formatMode,
                lessReturns,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const modeLabel = formatMode === 'detailed' ? 'Detailed' : 'Summarised';
            a.download = `Sales_Book_${modeLabel}_${dateRange.from}_to_${dateRange.to}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Excel spreadsheet downloaded successfully', { id: toastId });
        } catch (err: any) {
            console.error('Failed to export ERP Sales Book:', err);
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
        total_net_sales: 0,
        invoice_count: 0,
    };

    // Parameter Bar: Date controls, mode toggle, and less returns switch
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

            {/* Less Returns Toggle */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                <Switch
                    id="sales-book-less-returns"
                    checked={lessReturns}
                    onCheckedChange={setLessReturns}
                />
                <Label
                    htmlFor="sales-book-less-returns"
                    className="text-xs font-medium text-slate-700 cursor-pointer select-none"
                >
                    Less Returns
                </Label>
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

    return (
        <ReportPageLayout
            title="Sales Book"
            description="Detailed bill-by-bill register with granular tax slabs (0%, 5%, 12%, 18%) and returns adjustment."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Sales Book' },
            ]}
            parameterBar={parameterBar}
            exportActions={exportActions}
        >
            <div className="space-y-6">
                {/* 1. Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Taxable Turnover</span>
                            <Receipt className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                            {formatCurrency(summary.total_taxable)}
                        </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total GST Collected</span>
                            <Percent className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                            {formatCurrency(summary.total_gst)}
                        </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Round-Off</span>
                            <ArrowDownRight className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                            {formatCurrency(summary.total_round_off)}
                        </p>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200/80 rounded-lg p-3 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Net Sales Total</span>
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-emerald-800 mt-1.5">
                            {formatCurrency(summary.total_net_sales)}
                        </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 sm:p-4 col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Invoices</span>
                            <FileText className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                            {summary.invoice_count ?? rows.length}
                        </p>
                    </div>
                </div>

                {/* 2. Loading State */}
                {isLoading && (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                        <p className="text-sm font-semibold text-slate-700">Loading Sales Book...</p>
                        <p className="text-xs text-slate-400 mt-1">Aggregating granular GST slabs and reconciling returns.</p>
                    </div>
                )}

                {/* 3. Error State */}
                {isError && !isLoading && (
                    <div className="py-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
                        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                        <h3 className="text-sm font-bold">Failed to load sales book data</h3>
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
                        <h3 className="text-sm font-semibold text-slate-700">No Sales Records Found</h3>
                        <p className="text-xs text-slate-400 mt-1">
                            No invoices were generated in the selected date range ({dateRange.from} to {dateRange.to}).
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
                                                <TableHead className="w-32 font-bold text-slate-700">Bill No</TableHead>
                                                <TableHead className="min-w-[140px] font-bold text-slate-700">Party Name</TableHead>
                                                <TableHead className="w-32 font-bold text-slate-700">GSTIN</TableHead>
                                            </>
                                        ) : (
                                            <TableHead className="w-28 text-right font-bold text-slate-700">Bills</TableHead>
                                        )}
                                        <TableHead className="text-right font-bold text-slate-700">Taxable</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Tax 5%</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Tax 12%</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Tax 18%</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Tax 28%</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Total GST</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Exempted</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Round Off</TableHead>
                                        <TableHead className="text-right font-bold text-slate-900 bg-slate-200/50">Net Total</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {rows.map((row: any, idx: number) => {
                                        const isReturn = Boolean(row.is_return);
                                        return (
                                            <TableRow
                                                key={`${row.date}-${row.bill_no || idx}`}
                                                className={cn(
                                                    "transition-colors hover:bg-blue-50/40",
                                                    isReturn && "bg-rose-50/40 text-rose-800"
                                                )}
                                            >
                                                <TableCell className="font-mono text-slate-600">{row.date}</TableCell>
                                                {formatMode === 'detailed' ? (
                                                    <>
                                                        <TableCell className="font-medium font-mono text-slate-800 flex items-center gap-1.5">
                                                            {row.bill_no}
                                                            {isReturn && (
                                                                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 uppercase">
                                                                    Return
                                                                </Badge>
                                                            )}
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
                                                        {row.bill_count}
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
                                                <TableCell className="text-right font-mono text-slate-500">
                                                    {formatCurrency(row.round_off)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-slate-900 bg-slate-50/60">
                                                    {formatCurrency(row.net_total)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>

                                <TableFooter className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300 sticky bottom-0">
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={formatMode === 'detailed' ? 4 : 2} className="text-left font-bold text-slate-800 uppercase tracking-wider">
                                            Total ({rows.length} {formatMode === 'detailed' ? 'Invoices' : 'Days'})
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
                                        <TableCell className="text-right font-mono font-bold text-blue-800">
                                            {formatCurrency(summary.total_gst)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-700">
                                            {formatCurrency(summary.total_exempted)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-600">
                                            {formatCurrency(summary.total_round_off)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-black text-emerald-800 bg-slate-200/70">
                                            {formatCurrency(summary.total_net_sales)}
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
