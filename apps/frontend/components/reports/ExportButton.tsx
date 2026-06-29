'use client';

import { useState } from 'react';
import { Download, ChevronDown, Sheet, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DateRangeFilter } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useGSTReport } from '@/hooks/useReports';
import { getStoredToken } from '@/lib/apiClient';
import {
    exportSalesReportCSV,
    exportGSTReportCSV,
    exportStockValuationCSV,
    exportExpiryReportCSV,
    exportStaffReportCSV,
    exportPurchaseReportCSV,
} from '@/lib/reportExport';

interface ExportButtonProps {
    activeTab: string;
    dateRange: DateRangeFilter;
    batchFilters?: any;
}

export function ExportButton({ activeTab, dateRange, batchFilters }: ExportButtonProps) {
    const [pdfLoading, setPdfLoading] = useState(false);
    const { outlet } = useAuthStore();
    const { data: gstData } = useGSTReport(dateRange);

    const handleCSV = () => {
        const allSales: any[] = []; // Phase 2: getSalesReport API not yet wired to this component

        switch (activeTab) {
            case 'sales':
                exportSalesReportCSV(allSales, dateRange);
                break;
            case 'gst':
                if (gstData) exportGSTReportCSV(gstData);
                break;
            case 'stock':
                exportStockValuationCSV([]); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'expiry':
                exportExpiryReportCSV([]); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'staff':
                exportStaffReportCSV([], dateRange); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'purchases':
                exportPurchaseReportCSV([], dateRange); // Phase 2: NOT_IMPLEMENTED
                break;
            case 'batch':
                handleBackendExport('csv');
                break;
        }
    };

    const handleBackendExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
        if (!outlet) return;
        setPdfLoading(true);
        try {
            const token = getStoredToken();
            const queryParams = new URLSearchParams({ 
                outletId: outlet.id,
                export_format: format,
            });
            if (batchFilters?.date_from) queryParams.append('date_from', batchFilters.date_from);
            if (batchFilters?.date_to) queryParams.append('date_to', batchFilters.date_to);
            if (batchFilters?.reportType) queryParams.append('report_type', batchFilters.reportType);
            if (batchFilters?.search) queryParams.append('search', batchFilters.search);
            if (batchFilters?.expiryWithinDays) queryParams.append('expiry_within_days', batchFilters.expiryWithinDays.toString());
            
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/batch-wise/export/?${queryParams}`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            
            if (!response.ok) throw new Error('Export failed');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const ext = format === 'xlsx' ? 'xlsx' : format;
            a.download = `Batch-Report-${new Date().toISOString().split('T')[0]}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export error", error);
        } finally {
            setPdfLoading(false);
        }
    };

    const handleGSTPDF = async () => {
        if (!gstData || !outlet) return;
        setPdfLoading(true);
        try {
            const { pdf } = await import('@react-pdf/renderer');
            const { GSTReportPDF } = await import('@/lib/GSTReportPDF');
            const blob = await pdf(<GSTReportPDF summary={gstData} outlet={outlet} />).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GST-Report-${dateRange.from}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pdfLoading}>
                    {pdfLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4 mr-2" />
                    )}
                    {pdfLoading ? 'Generating...' : 'Export'}
                    <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCSV}>
                    <Sheet className="w-4 h-4 mr-2" />
                    Export CSV
                    <span className="ml-auto text-xs text-muted-foreground">⌘E</span>
                </DropdownMenuItem>
                {activeTab === 'gst' && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleGSTPDF}>
                            <FileDown className="w-4 h-4 mr-2" />
                            Export PDF
                        </DropdownMenuItem>
                    </>
                )}
                {activeTab === 'batch' && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBackendExport('xlsx')}>
                            <Sheet className="w-4 h-4 mr-2" />
                            Export Excel (XLSX)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBackendExport('pdf')}>
                            <FileDown className="w-4 h-4 mr-2" />
                            Export PDF
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
