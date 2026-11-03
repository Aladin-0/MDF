'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
    FileSpreadsheet,
    Loader2,
    Calendar,
    Receipt,
    Percent,
    AlertCircle,
    FileText,
    RefreshCw,
    ShoppingCart,
    Undo2,
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
import { exportErpReport, getErpPurchaseBook, getErpPurchaseReturnBook } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

export type ErpPurchaseReportKind = 'purchase-book' | 'consolidated-purchase-book' | 'purchase-return-book';
type FormatMode = 'detailed' | 'summarised';

interface KindConfig {
    title: string;
    description: string;
    defaultMode: FormatMode;
    defaultLessReturns: boolean;
    hasLessReturns: boolean;
    isReturnBook: boolean;
    filePrefix: string;
    countLabel: string; // header of the count column in summarised mode
    totalLabel: string; // KPI label for the grand total
    docLabel: string; // KPI label for the document count
    emptyTitle: string;
    emptyHint: string;
    loadingHint: string;
}

const KIND_CONFIG: Record<ErpPurchaseReportKind, KindConfig> = {
    'purchase-book': {
        title: 'Purchase Book',
        description: 'Bill-by-bill register of posted purchase invoices with taxable value, GST and round-off.',
        defaultMode: 'detailed',
        defaultLessReturns: false,
        hasLessReturns: true,
        isReturnBook: false,
        filePrefix: 'Purchase_Book',
        countLabel: 'Bills',
        totalLabel: 'Net Purchase Total',
        docLabel: 'Total Bills',
        emptyTitle: 'No Purchase Records Found',
        emptyHint: 'No purchase bills were posted in the selected date range',
        loadingHint: 'Collecting posted purchase invoices.',
    },
    'consolidated-purchase-book': {
        title: 'Consolidated Purchase Book',
        description: 'Daily purchase totals with GST, round-off and purchase-return adjustments.',
        defaultMode: 'summarised',
        defaultLessReturns: true,
        hasLessReturns: true,
        isReturnBook: false,
        filePrefix: 'Consolidated_Purchase_Book',
        countLabel: 'Bills',
        totalLabel: 'Net Purchase Total',
        docLabel: 'Total Bills',
        emptyTitle: 'No Purchase Records Found',
        emptyHint: 'No purchase bills were posted in the selected date range',
        loadingHint: 'Aggregating daily purchases and reconciling returns.',
    },
    'purchase-return-book': {
        title: 'Purchase Return Book',
        description: 'Debit notes raised against distributors, with reversed GST and return totals.',
        defaultMode: 'detailed',
        defaultLessReturns: false,
        hasLessReturns: false,
        isReturnBook: true,
        filePrefix: 'Purchase_Return_Book',
        countLabel: 'Returns',
        totalLabel: 'Net Returns Total',
        docLabel: 'Total Returns',
        emptyTitle: 'No Purchase Returns Found',
        emptyHint: 'No debit notes were raised in the selected date range',
        loadingHint: 'Collecting debit notes.',
    },
};

const EMPTY_SUMMARY = {
    total_bill_amt: 0,
    total_taxable: 0,
    total_tax: 0,
    total_tax_free: 0,
    total_exempted: 0,
    total_round_off: 0,
    bill_count: 0,
    return_count: 0,
    return_amount: 0,
};

// Indian-numbering currency
function formatCurrency(val: number | null | undefined): string {
    const num = Number(val || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function KpiCard({ label, value, icon: Icon, tone }: {
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    tone?: 'total';
}) {
    return (
        <div
            className={cn(
                'rounded-lg p-3 sm:p-4 border',
                tone === 'total' ? 'bg-emerald-50 border-emerald-200/80' : 'bg-slate-50 border-slate-200/80'
            )}
        >
            <div className="flex items-center justify-between">
                <span className={cn(
                    'text-xs font-medium uppercase tracking-wider',
                    tone === 'total' ? 'text-emerald-700' : 'text-slate-500'
                )}>
                    {label}
                </span>
                <Icon className={cn('w-4 h-4', tone === 'total' ? 'text-emerald-600' : 'text-slate-400')} />
            </div>
            <p className={cn(
                'text-lg sm:text-xl font-bold mt-1.5',
                tone === 'total' ? 'text-emerald-800' : 'text-slate-900'
            )}>
                {value}
            </p>
        </div>
    );
}

export function ErpPurchaseRegisterReport({ kind }: { kind: ErpPurchaseReportKind }) {
    const cfg = KIND_CONFIG[kind];
    const outletId = useOutletId();

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfMonthStr = format(startOfMonth(now), 'yyyy-MM-dd');

    const [formatMode, setFormatMode] = useState<FormatMode>(cfg.defaultMode);
    const [lessReturns, setLessReturns] = useState<boolean>(cfg.defaultLessReturns);
    const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
        from: startOfMonthStr,
        to: todayStr,
    });
    const [isDownloading, setIsDownloading] = useState<boolean>(false);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['reports', 'erp', kind, outletId, formatMode, lessReturns, dateRange.from, dateRange.to],
        queryFn: async () => {
            if (!outletId) return null;
            if (cfg.isReturnBook) {
                return await getErpPurchaseReturnBook(outletId, {
                    format: formatMode,
                    startDate: dateRange.from,
                    endDate: dateRange.to,
                });
            }
            return await getErpPurchaseBook(outletId, {
                format: formatMode,
                lessReturns,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });
        },
        enabled: Boolean(outletId && dateRange.from && dateRange.to),
    });

    const handlePresetChange = (preset: 'today' | 'this_month' | 'last_month') => {
        const currentDate = new Date();
        if (preset === 'today') {
            const today = format(currentDate, 'yyyy-MM-dd');
            setDateRange({ from: today, to: today });
        } else if (preset === 'this_month') {
            setDateRange({
                from: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
                to: format(currentDate, 'yyyy-MM-dd'),
            });
        } else {
            const prevMonth = subMonths(currentDate, 1);
            setDateRange({
                from: format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
                to: format(endOfMonth(prevMonth), 'yyyy-MM-dd'),
            });
        }
    };

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
        const toastId = toast.loading(`Generating ${cfg.title} Excel spreadsheet...`);

        try {
            const blob = await exportErpReport(outletId, {
                reportType: kind,
                format: formatMode,
                lessReturns: cfg.hasLessReturns ? lessReturns : undefined,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const modeLabel = formatMode === 'detailed' ? 'Detailed' : 'Summarised';
            a.download = `${cfg.filePrefix}_${modeLabel}_${dateRange.from}_to_${dateRange.to}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Excel spreadsheet downloaded successfully', { id: toastId });
        } catch (err: any) {
            console.error(`Failed to export ${cfg.title}:`, err);
            toast.error(err?.message || 'Failed to download report. Please try again.', { id: toastId });
        } finally {
            setIsDownloading(false);
        }
    };

    const rows: any[] = data?.rows || [];
    const summary = { ...EMPTY_SUMMARY, ...(data?.summary || {}) };
    const docCount = cfg.isReturnBook ? summary.return_count : summary.bill_count;
    const detailed = formatMode === 'detailed';
    const toggleId = `${kind}-less-returns`;

    const parameterBar = (
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
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

            <div className="hidden lg:flex items-center gap-1">
                {([
                    ['today', 'Today'],
                    ['this_month', 'This Month'],
                    ['last_month', 'Last Month'],
                ] as const).map(([preset, label]) => (
                    <Button
                        key={preset}
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePresetChange(preset)}
                        className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                    >
                        {label}
                    </Button>
                ))}
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                {(['detailed', 'summarised'] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => setFormatMode(mode)}
                        className={cn(
                            'px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize',
                            formatMode === mode
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        )}
                    >
                        {mode}
                    </button>
                ))}
            </div>

            {cfg.hasLessReturns && (
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                    <Switch id={toggleId} checked={lessReturns} onCheckedChange={setLessReturns} />
                    <Label htmlFor={toggleId} className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                        Less Returns
                    </Label>
                </div>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8 p-0 bg-white border-slate-200 shadow-2xs"
                title="Refresh Report Data"
            >
                <RefreshCw className={cn('w-3.5 h-3.5 text-slate-600', isFetching && 'animate-spin')} />
            </Button>
        </div>
    );

    const exportActions = (
        <Button
            onClick={handleDownloadExcel}
            disabled={isDownloading || isLoading || rows.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-2 shadow-xs transition-all"
        >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            <span>Download Excel</span>
        </Button>
    );

    return (
        <ReportPageLayout
            title={cfg.title}
            description={cfg.description}
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: cfg.title },
            ]}
            parameterBar={parameterBar}
            exportActions={exportActions}
        >
            <div className="space-y-6">
                {/* Summary KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                    <KpiCard label="Taxable Value" value={formatCurrency(summary.total_taxable)} icon={Receipt} />
                    <KpiCard
                        label={cfg.isReturnBook ? 'GST Reversed' : 'Total GST (Input)'}
                        value={formatCurrency(summary.total_tax)}
                        icon={Percent}
                    />
                    <KpiCard
                        label={cfg.isReturnBook ? 'Total Returned' : 'Gross Bill Value'}
                        value={formatCurrency(
                            cfg.isReturnBook ? summary.total_bill_amt : summary.total_bill_amt + summary.return_amount
                        )}
                        icon={cfg.isReturnBook ? Undo2 : ShoppingCart}
                    />
                    <KpiCard label={cfg.totalLabel} value={formatCurrency(summary.total_bill_amt)} icon={FileSpreadsheet} tone="total" />
                    <div className="col-span-2 sm:col-span-1">
                        <KpiCard label={cfg.docLabel} value={docCount ?? rows.length} icon={FileText} />
                    </div>
                </div>

                {isLoading && (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                        <p className="text-sm font-semibold text-slate-700">Loading {cfg.title}...</p>
                        <p className="text-xs text-slate-400 mt-1">{cfg.loadingHint}</p>
                    </div>
                )}

                {isError && !isLoading && (
                    <div className="py-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
                        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                        <h3 className="text-sm font-bold">Failed to load {cfg.title.toLowerCase()} data</h3>
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

                {!isLoading && !isError && data && rows.length === 0 && (
                    <div className="py-16 text-center">
                        <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-sm font-semibold text-slate-700">{cfg.emptyTitle}</h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {cfg.emptyHint} ({dateRange.from} to {dateRange.to}).
                        </p>
                    </div>
                )}

                {!isLoading && !isError && rows.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto max-h-[600px]">
                            <Table className="text-xs">
                                <TableHeader className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-24 font-bold text-slate-700">Date</TableHead>
                                        {detailed ? (
                                            <>
                                                <TableHead className="w-32 font-bold text-slate-700">Bill No</TableHead>
                                                <TableHead className="min-w-[160px] font-bold text-slate-700">Party Name</TableHead>
                                            </>
                                        ) : (
                                            <TableHead className="w-28 text-right font-bold text-slate-700">{cfg.countLabel}</TableHead>
                                        )}
                                        <TableHead className="text-right font-bold text-slate-900 bg-slate-200/50">Bill Amt</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Taxable</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Tax</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Tax Free</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Exempted</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">R.Off</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {rows.map((row: any, idx: number) => {
                                        const showReturnBadge = Boolean(row.is_return) && !cfg.isReturnBook;
                                        return (
                                            <TableRow
                                                key={`${row.date}-${row.bill_no || 'day'}-${idx}`}
                                                className={cn(
                                                    'transition-colors hover:bg-blue-50/40',
                                                    showReturnBadge && 'bg-rose-50/40 text-rose-800'
                                                )}
                                            >
                                                <TableCell className="font-mono text-slate-600">{row.date}</TableCell>
                                                {detailed ? (
                                                    <>
                                                        <TableCell className="font-medium font-mono text-slate-800">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                {row.bill_no}
                                                                {showReturnBadge && (
                                                                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 uppercase">
                                                                        Return
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell
                                                            className="font-medium text-slate-800 truncate max-w-[260px]"
                                                            title={row.party_name}
                                                        >
                                                            {row.party_name || 'URD Purchase'}
                                                        </TableCell>
                                                    </>
                                                ) : (
                                                    <TableCell className="text-right font-medium text-slate-800 font-mono">
                                                        {cfg.isReturnBook ? row.return_count : row.bill_count}
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-right font-mono font-bold text-slate-900 bg-slate-50/60">
                                                    {formatCurrency(row.bill_amt)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-medium text-slate-700">
                                                    {formatCurrency(row.taxable)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-semibold text-slate-800">
                                                    {formatCurrency(row.tax)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-slate-600">
                                                    {formatCurrency(row.tax_free)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-slate-600">
                                                    {formatCurrency(row.exempted)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-slate-500">
                                                    {formatCurrency(row.round_off)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>

                                <TableFooter className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300 sticky bottom-0">
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={detailed ? 3 : 2} className="text-left font-bold text-slate-800 uppercase tracking-wider">
                                            Total ({docCount ?? rows.length} {cfg.isReturnBook ? 'Returns' : 'Bills'})
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-black text-emerald-800 bg-slate-200/70">
                                            {formatCurrency(summary.total_bill_amt)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-900">
                                            {formatCurrency(summary.total_taxable)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-blue-800">
                                            {formatCurrency(summary.total_tax)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-700">
                                            {formatCurrency(summary.total_tax_free)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-700">
                                            {formatCurrency(summary.total_exempted)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-600">
                                            {formatCurrency(summary.total_round_off)}
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
