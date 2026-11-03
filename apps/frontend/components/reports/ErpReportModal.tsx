'use client';

import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import {
    FileSpreadsheet,
    TrendingUp,
    Receipt,
    Download,
    Loader2,
    Calendar as CalendarIcon,
    Layers,
    RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { exportErpReport } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

export type ErpReportType = 'sales-book' | 'gross-profit';
export type ErpFormatMode = 'detailed' | 'summarised';

interface ErpReportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultOutletId?: string;
}

export function ErpReportModal({ open, onOpenChange, defaultOutletId }: ErpReportModalProps) {
    const { outlet, user } = useAuthStore();
    const effectiveOutletId = defaultOutletId || outlet?.id || user?.outletId || '';

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

    const [reportType, setReportType] = useState<ErpReportType>('sales-book');
    const [formatMode, setFormatMode] = useState<ErpFormatMode>('detailed');
    const [lessReturns, setLessReturns] = useState<boolean>(true);
    const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
        from: startOfMonthStr,
        to: todayStr,
    });
    const [isDownloading, setIsDownloading] = useState<boolean>(false);

    const handleApplyPreset = (preset: 'today' | 'this_month' | 'last_month' | 'this_year') => {
        const now = new Date();
        if (preset === 'today') {
            const today = format(now, 'yyyy-MM-dd');
            setDateRange({ from: today, to: today });
        } else if (preset === 'this_month') {
            setDateRange({
                from: format(startOfMonth(now), 'yyyy-MM-dd'),
                to: format(now, 'yyyy-MM-dd'),
            });
        } else if (preset === 'last_month') {
            const prevMonth = subMonths(now, 1);
            setDateRange({
                from: format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
                to: format(endOfMonth(prevMonth), 'yyyy-MM-dd'),
            });
        } else if (preset === 'this_year') {
            setDateRange({
                from: format(startOfYear(now), 'yyyy-MM-dd'),
                to: format(now, 'yyyy-MM-dd'),
            });
        }
    };

    const handleDownload = async () => {
        if (!effectiveOutletId) {
            toast.error('No active outlet detected. Please select an outlet first.');
            return;
        }

        if (!dateRange.from || !dateRange.to) {
            toast.error('Please specify both a start and end date.');
            return;
        }

        if (dateRange.from > dateRange.to) {
            toast.error('Start date cannot be after end date.');
            return;
        }

        setIsDownloading(true);
        const toastId = toast.loading('Generating Marg ERP Excel spreadsheet...');

        try {
            const blob = await exportErpReport(effectiveOutletId, {
                reportType,
                format: formatMode,
                lessReturns,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const reportName = reportType === 'sales-book' ? 'Sales_Book' : 'Gross_Profit';
            const modeName = formatMode === 'detailed' ? 'Detailed' : 'Summarised';
            a.download = `ERP_${reportName}_${modeName}_${dateRange.from}_to_${dateRange.to}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Excel report downloaded successfully', { id: toastId });
            onOpenChange(false);
        } catch (error: any) {
            console.error('ERP Report export error:', error);
            toast.error(error.message || 'Failed to generate ERP Excel report', { id: toastId });
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden border border-slate-200 shadow-2xl sm:rounded-2xl bg-white text-slate-900">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
                                <FileSpreadsheet className="w-5 h-5 text-indigo-300" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold text-white tracking-tight">
                                    Marg ERP Excel Exporter
                                </DialogTitle>
                                <DialogDescription className="text-xs text-indigo-200/80 mt-0.5">
                                    Generate audited pharmaceutical reports with GST tax slabs, COGS reversals, and Marg formatting.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                    {/* 1. Report Type Selection */}
                    <div className="space-y-2.5">
                        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            Select Report Type
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setReportType('sales-book')}
                                className={cn(
                                    "flex flex-col text-left p-3.5 rounded-xl border transition-all relative",
                                    reportType === 'sales-book'
                                        ? "border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600"
                                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                                )}
                            >
                                <div className="flex items-center justify-between w-full mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1.5 rounded-lg", reportType === 'sales-book' ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}>
                                            <Receipt className="w-4 h-4" />
                                        </div>
                                        <span className="font-semibold text-sm text-slate-900">Sales Book</span>
                                    </div>
                                    <div className={cn("w-2 h-2 rounded-full", reportType === 'sales-book' ? "bg-indigo-600" : "bg-slate-300")} />
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Consolidated register with 0%, 5%, 12%, 18%, 28% GST categories, round-off, and net totals.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setReportType('gross-profit')}
                                className={cn(
                                    "flex flex-col text-left p-3.5 rounded-xl border transition-all relative",
                                    reportType === 'gross-profit'
                                        ? "border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600"
                                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                                )}
                            >
                                <div className="flex items-center justify-between w-full mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1.5 rounded-lg", reportType === 'gross-profit' ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}>
                                            <TrendingUp className="w-4 h-4" />
                                        </div>
                                        <span className="font-semibold text-sm text-slate-900">Gross Profit Report</span>
                                    </div>
                                    <div className={cn("w-2 h-2 rounded-full", reportType === 'gross-profit' ? "bg-indigo-600" : "bg-slate-300")} />
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Net sales vs landing cost (COGS), gross profit, margin %, and sales return cost reversals.
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* 2. Format Mode & Options (2 Columns) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Format Mode */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Grouping / Format
                            </Label>
                            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setFormatMode('detailed')}
                                    className={cn(
                                        "py-2 px-3 text-xs font-semibold rounded-lg transition-all text-center",
                                        formatMode === 'detailed'
                                            ? "bg-white text-indigo-700 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                    )}
                                >
                                    Detailed (Bill-Wise)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormatMode('summarised')}
                                    className={cn(
                                        "py-2 px-3 text-xs font-semibold rounded-lg transition-all text-center",
                                        formatMode === 'summarised'
                                            ? "bg-white text-indigo-700 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                    )}
                                >
                                    Summarised (Day-Wise)
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400">
                                {formatMode === 'detailed'
                                    ? 'Shows each individual invoice with customer & GSTIN details.'
                                    : 'Rolls up daily totals with bill counts and daily tax breakdown.'}
                            </p>
                        </div>

                        {/* Less Returns Toggle */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Accounting Adjustments
                            </Label>
                            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 flex items-center justify-between">
                                <div className="space-y-0.5 pr-2">
                                    <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                        Less Returns
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                        Subtract credit notes and reverse inventory COGS.
                                    </div>
                                </div>
                                <Switch
                                    checked={lessReturns}
                                    onCheckedChange={setLessReturns}
                                    id="less-returns-toggle"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 3. Date Range Selection */}
                    <div className="space-y-3 pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                                Date Range
                            </Label>
                            {/* Quick Presets */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset('today')}
                                    className="px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                                >
                                    Today
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset('this_month')}
                                    className="px-2 py-0.5 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                                >
                                    This Month
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset('last_month')}
                                    className="px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                                >
                                    Last Month
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset('this_year')}
                                    className="px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                                >
                                    This Year
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-[11px] font-medium text-slate-500">From Date</span>
                                <Input
                                    type="date"
                                    value={dateRange.from}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                                    className="h-10 text-xs bg-white border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[11px] font-medium text-slate-500">To Date</span>
                                <Input
                                    type="date"
                                    value={dateRange.to}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                                    className="h-10 text-xs bg-white border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <DialogFooter className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between sm:justify-between w-full">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isDownloading}
                        className="text-slate-600 hover:text-slate-900"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 gap-2 shadow-sm"
                    >
                        {isDownloading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating Spreadsheet...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                Download Excel (.xlsx)
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
