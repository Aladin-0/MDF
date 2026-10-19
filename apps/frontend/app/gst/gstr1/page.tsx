'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { gstApi } from '@/lib/apiClient';
import { ValidationPanel } from '@/components/gst/ValidationPanel';
import { ReportFilterRibbon } from '@/components/gst/ReportFilterRibbon';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

// Define the shape of our grid data
type InvoiceRow = {
  id: string;
  invoice_no: string;
  customer_name: string;
  gstin: string;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  total: number;
};

const columnHelper = createColumnHelper<InvoiceRow>();

export default function GSTR1Page() {
    const [summaryData, setSummaryData] = useState<any>(null);
    const [invoiceData, setInvoiceData] = useState<InvoiceRow[]>([]);
    
    // Filter States
    const [reportType, setReportType] = useState('all');
    const [taxFilter, setTaxFilter] = useState('all');

    // Date Range state: Single Source of Truth
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const now = new Date();
        return {
            from: new Date(now.getFullYear(), now.getMonth(), 1),
            to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        };
    });

    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const { toast } = useToast();

    const fromDate = useMemo(() => {
        return dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
    }, [dateRange?.from]);

    const toDate = useMemo(() => {
        return dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
    }, [dateRange?.to]);

    const columns = useMemo(() => [
      columnHelper.accessor('invoice_no', {
        header: 'Invoice No',
        cell: info => <span className="font-medium text-slate-900">{info.getValue()}</span>,
        meta: { align: 'left' }
      }),
      columnHelper.accessor('customer_name', {
        header: 'Customer Name',
        meta: { align: 'left' }
      }),
      columnHelper.accessor('gstin', {
        header: 'GSTIN',
        meta: { align: 'left' }
      }),
      columnHelper.accessor('taxable_value', {
        header: 'Taxable Value',
        cell: info => info.getValue().toFixed(2),
        meta: { align: 'right' }
      }),
      columnHelper.accessor('igst', {
        header: 'IGST',
        cell: info => info.getValue().toFixed(2),
        meta: { align: 'right' }
      }),
      columnHelper.accessor('cgst', {
        header: 'CGST',
        cell: info => info.getValue().toFixed(2),
        meta: { align: 'right' }
      }),
      columnHelper.accessor('sgst', {
        header: 'SGST',
        cell: info => info.getValue().toFixed(2),
        meta: { align: 'right' }
      }),
      columnHelper.accessor('total', {
        header: 'Total',
        cell: info => <span className="font-bold">{info.getValue().toFixed(2)}</span>,
        meta: { align: 'right' }
      }),
    ], []);

    const table = useReactTable({
      data: invoiceData,
      columns,
      getCoreRowModel: getCoreRowModel(),
    });

    // Calculate totals for footer
    const totals = useMemo(() => {
      return invoiceData.reduce((acc, row) => ({
        taxable_value: acc.taxable_value + (row.taxable_value || 0),
        igst: acc.igst + (row.igst || 0),
        cgst: acc.cgst + (row.cgst || 0),
        sgst: acc.sgst + (row.sgst || 0),
        total: acc.total + (row.total || 0),
      }), { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, total: 0 });
    }, [invoiceData]);

    const loadDashboardData = useCallback(async (start?: string, end?: string) => {
        const queryStart = start || fromDate;
        const queryEnd = end || toDate;
        if (!queryStart || !queryEnd) return;
        setLoading(true);
        try {
            const [summary, invoices] = await Promise.all([
                gstApi.getSummary(queryStart, queryEnd, 'gstr1'),
                gstApi.getGSTR1Invoices(queryStart, queryEnd, { report_type: reportType, tax_filter: taxFilter })
            ]);
            setSummaryData(summary);
            setInvoiceData(invoices || []);
        } catch (error) {
            console.error("Failed to load dashboard data", error);
            toast({ variant: 'destructive', title: 'Failed to load dashboard data' });
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, reportType, taxFilter, toast]);

    // Auto-fetch data on mount and whenever date range or filter state changes
    useEffect(() => {
        if (fromDate && toDate) {
            loadDashboardData(fromDate, toDate);
        }
    }, [fromDate, toDate, reportType, taxFilter, loadDashboardData]);

    const handleSearch = (start?: string, end?: string) => {
        loadDashboardData(start || fromDate, end || toDate);
    };

    const handleExportExcel = async (period?: string) => {
        const periodToExport = period || (dateRange?.from ? format(dateRange.from, 'MMyyyy') : null);
        if (!periodToExport) {
            toast({ 
                variant: 'destructive', 
                title: 'Export Failed', 
                description: 'Please select a date range to export.' 
            });
            return;
        }
        setExporting(true);
        try {
            await gstApi.generateExport(periodToExport, 'gstr1_excel');
            toast({ title: 'Export successful. Check Export History for audit details.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Export failed', description: error?.detail || 'An error occurred' });
        } finally {
            setExporting(false);
        }
    };
    
    const handleExportJson = async (period?: string) => {
        const periodToExport = period || (dateRange?.from ? format(dateRange.from, 'MMyyyy') : null);
        if (!periodToExport) {
            toast({ 
                variant: 'destructive', 
                title: 'Export Failed', 
                description: 'Please select a date range to export.' 
            });
            return;
        }
        setExporting(true);
        try {
            await gstApi.generateExport(periodToExport, 'gstr1_json');
            toast({ title: 'JSON Export successful.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Export failed', description: error?.detail || 'An error occurred' });
        } finally {
            setExporting(false);
        }
    };
    
    const handlePrint = () => {
        window.print();
    };

    const isValid = summaryData?.validation?.is_valid_for_export;

    return (
        <div className="space-y-4 max-w-full mx-auto pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">GSTR-1 Management</h1>
                    <p className="text-sm text-slate-500">Review outward supplies and generate the official Offline Tool Excel.</p>
                </div>
            </div>

            <ReportFilterRibbon 
              reportType={reportType}
              setReportType={setReportType}
              taxFilter={taxFilter}
              setTaxFilter={setTaxFilter}
              dateRange={dateRange}
              setDateRange={setDateRange}
              showPeriodSelector={false}
              onSearch={handleSearch}
              onPrint={handlePrint}
              onDownloadExcel={handleExportExcel}
              onDownloadJson={handleExportJson}
              isExporting={exporting}
              exportDisabled={!isValid || exporting}
            />


            {loading && !summaryData ? (
                <div className="space-y-4">
                    <Skeleton className="w-full h-12" />
                    <Skeleton className="w-full h-64" />
                </div>
            ) : (
                <>
                    {summaryData?.validation && (
                        <ValidationPanel validation={summaryData.validation} />
                    )}

                    <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                          <thead className="text-xs text-slate-700 bg-slate-100 uppercase border-b border-slate-200 sticky top-0">
                            {table.getHeaderGroups().map(headerGroup => (
                              <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => {
                                  const align = (header.column.columnDef.meta as any)?.align || 'left';
                                  return (
                                    <th 
                                      key={header.id} 
                                      className={`py-2 px-3 font-semibold whitespace-nowrap text-${align}`}
                                    >
                                      {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                          )}
                                    </th>
                                  );
                                })}
                              </tr>
                            ))}
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {table.getRowModel().rows.map(row => (
                              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                {row.getVisibleCells().map(cell => {
                                  const align = (cell.column.columnDef.meta as any)?.align || 'left';
                                  return (
                                    <td 
                                      key={cell.id} 
                                      className={`py-1.5 px-3 whitespace-nowrap text-${align} text-slate-600`}
                                    >
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t border-slate-200 sticky bottom-0 font-semibold text-slate-900">
                            <tr>
                              <td className="py-2 px-3" colSpan={3}>Totals</td>
                              <td className="py-2 px-3 text-right">{totals.taxable_value.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals.igst.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals.cgst.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals.sgst.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals.total.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                </>
            )}
        </div>
    );
}
