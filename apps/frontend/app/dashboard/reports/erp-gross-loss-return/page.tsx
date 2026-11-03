'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { AlertCircle, CalendarDays, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useOutletId } from '@/hooks/useOutletId';
import { exportErpReport, getErpGrossLossOnReturn } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

type FormatMode = 'detailed' | 'summarised';

interface GrossLossRow {
    date: string;
    return_no?: string;
    party_name?: string;
    return_count?: number;
    return_amount: number;
    cogs: number;
    gross_loss: number;
    loss_pct: number;
}

interface GrossLossReport {
    format: FormatMode;
    rows: GrossLossRow[];
    summary: {
        return_count: number;
        total_return_amount: number;
        total_cogs: number;
        total_gross_loss: number;
        loss_pct: number;
    };
}

const rupees = (value: number | null | undefined) =>
    `₹${Number(value ?? 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const percent = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(2)}%`;

export default function GrossLossOnReturnPage() {
    const outletId = useOutletId();
    const [formatMode, setFormatMode] = useState<FormatMode>('detailed');
    const [dateRange, setDateRange] = useState(() => {
        const today = new Date();
        return {
            from: format(startOfMonth(today), 'yyyy-MM-dd'),
            to: format(today, 'yyyy-MM-dd'),
        };
    });
    const [isDownloading, setIsDownloading] = useState(false);
    const validRange = Boolean(dateRange.from && dateRange.to && dateRange.from <= dateRange.to);

    const { data, isLoading, isFetching, isError, error, refetch } = useQuery<GrossLossReport>({
        queryKey: ['reports', 'erp-gross-loss-return', outletId, formatMode, dateRange.from, dateRange.to],
        queryFn: () => getErpGrossLossOnReturn(outletId!, {
            format: formatMode,
            startDate: dateRange.from,
            endDate: dateRange.to,
        }),
        enabled: Boolean(outletId && validRange),
    });

    const rows = data?.rows ?? [];
    const summary = data?.summary;

    const downloadExcel = async () => {
        if (!outletId) {
            toast.error('Select an outlet to download this report.');
            return;
        }
        if (!validRange) {
            toast.error('Choose a valid start and end date.');
            return;
        }

        setIsDownloading(true);
        try {
            const blob = await exportErpReport(outletId, {
                reportType: 'gross-loss-return',
                format: formatMode,
                startDate: dateRange.from,
                endDate: dateRange.to,
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Gross_Loss_On_Return_${formatMode}_${dateRange.from}_to_${dateRange.to}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
            toast.success('Gross loss report downloaded.');
        } catch (downloadError) {
            toast.error(downloadError instanceof Error ? downloadError.message : 'Could not download the report.');
        } finally {
            setIsDownloading(false);
        }
    };

    const parameterBar = (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <label htmlFor="gross-loss-from" className="text-xs font-medium text-slate-600">From</label>
                <Input
                    id="gross-loss-from"
                    type="date"
                    value={dateRange.from}
                    max={dateRange.to || undefined}
                    onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
                    className="h-8 w-36 text-xs"
                />
                <label htmlFor="gross-loss-to" className="text-xs font-medium text-slate-600">To</label>
                <Input
                    id="gross-loss-to"
                    type="date"
                    value={dateRange.to}
                    min={dateRange.from || undefined}
                    onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                    className="h-8 w-36 text-xs"
                />
            </div>
            <div className="flex rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Report format">
                {(['detailed', 'summarised'] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        aria-pressed={formatMode === mode}
                        onClick={() => setFormatMode(mode)}
                        className={cn(
                            'rounded-md px-3 py-1.5 text-xs font-medium capitalize',
                            formatMode === mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                        )}
                    >
                        {mode}
                    </button>
                ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!outletId || !validRange || isFetching}>
                <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
                Refresh
            </Button>
        </div>
    );

    const exportActions = (
        <Button onClick={downloadExcel} disabled={!outletId || !validRange || isDownloading || isLoading}>
            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Download Excel
        </Button>
    );

    return (
        <ReportPageLayout
            title="Gross Loss on Sales Return"
            description="Reconciliation of refunded revenue against reversed Cost of Goods Sold (COGS)."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Gross Loss on Return' },
            ]}
            parameterBar={parameterBar}
            exportActions={exportActions}
        >
            {!validRange && <p className="mb-4 text-sm text-red-600">Choose a start date on or before the end date.</p>}
            {!outletId && <p className="text-sm text-slate-600">Select an outlet to view this report.</p>}
            {isLoading && (
                <div className="space-y-3 animate-pulse" role="status" aria-label="Loading gross loss report">
                    <div className="h-10 rounded bg-slate-100" />
                    {[0, 1, 2, 3].map((item) => <div key={item} className="h-12 rounded bg-slate-100" />)}
                </div>
            )}
            {isError && !isLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error instanceof Error ? error.message : 'Could not load the report.'}
                </div>
            )}
            {outletId && validRange && !isLoading && !isError && rows.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-500">No sales returns found for this date range.</p>
            )}
            {!isLoading && !isError && rows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50">
                                <TableHead>Date</TableHead>
                                {formatMode === 'detailed' ? (
                                    <>
                                        <TableHead>Return No</TableHead>
                                        <TableHead>Party Name</TableHead>
                                    </>
                                ) : <TableHead className="text-right">Return Count</TableHead>}
                                <TableHead className="text-right">Return Amount</TableHead>
                                <TableHead className="text-right">Cost</TableHead>
                                <TableHead className="text-right">Gross Loss</TableHead>
                                <TableHead className="text-right">Loss %</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, index) => (
                                <TableRow key={`${row.date}-${row.return_no ?? index}`}>
                                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                                    {formatMode === 'detailed' ? (
                                        <>
                                            <TableCell>{row.return_no}</TableCell>
                                            <TableCell>{row.party_name || 'Walk-in Customer (Return)'}</TableCell>
                                        </>
                                    ) : <TableCell className="text-right">{row.return_count ?? 0}</TableCell>}
                                    <TableCell className="text-right whitespace-nowrap">{rupees(row.return_amount)}</TableCell>
                                    <TableCell className="text-right whitespace-nowrap">{rupees(row.cogs)}</TableCell>
                                    <TableCell className="text-right whitespace-nowrap text-red-600 font-medium">{rupees(row.gross_loss)}</TableCell>
                                    <TableCell className="text-right whitespace-nowrap text-red-600 font-medium">{percent(row.loss_pct)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={formatMode === 'detailed' ? 3 : 1} className="font-semibold">Total</TableCell>
                                {formatMode === 'summarised' && <TableCell className="text-right">{summary?.return_count ?? 0}</TableCell>}
                                <TableCell className="text-right">{rupees(summary?.total_return_amount)}</TableCell>
                                <TableCell className="text-right">{rupees(summary?.total_cogs)}</TableCell>
                                <TableCell className="text-right text-red-600 font-medium">{rupees(summary?.total_gross_loss)}</TableCell>
                                <TableCell className="text-right text-red-600 font-medium">{percent(summary?.loss_pct)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            )}
        </ReportPageLayout>
    );
}
