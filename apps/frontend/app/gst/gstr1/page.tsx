'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { gstApi } from '@/lib/apiClient';
import { useGSTStore } from '@/store/gstStore';
import { ValidationPanel } from '@/components/gst/ValidationPanel';
import { ReportFilterRibbon } from '@/components/gst/ReportFilterRibbon';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
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

    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const { toast } = useToast();

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
        taxable_value: acc.taxable_value + row.taxable_value,
        igst: acc.igst + row.igst,
        cgst: acc.cgst + row.cgst,
        sgst: acc.sgst + row.sgst,
        total: acc.total + row.total,
      }), { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, total: 0 });
    }, [invoiceData]);

    const loadDashboardData = useCallback(async (start: string, end: string) => {
        if (!start || !end) return;
        setLoading(true);
        try {
            const [summary, invoices] = await Promise.all([
                gstApi.getSummary(start, end),
                gstApi.getGSTR1Invoices(start, end, { report_type: reportType, tax_filter: taxFilter })
            ]);
            setSummaryData(summary);
            setInvoiceData(invoices);
        } catch (error) {
            console.error("Failed to load dashboard data", error);
            toast({ variant: 'destructive', title: 'Failed to load dashboard data' });
        } finally {
            setLoading(false);
        }
    }, [reportType, taxFilter, toast]);

    
    const handleSearch = (start: string, end: string) => {
        loadDashboardData(start, end);
    };

    const handleExportExcel = async (period: string) => {
        if (!period) return;
        setExporting(true);
        try {
            await gstApi.generateExport(period, 'gstr1_excel');
            toast({ title: 'Export successful. Check Export History for audit details.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Export failed', description: error?.detail || 'An error occurred' });
        } finally {
            setExporting(false);
        }
    };
    
    const handleExportJson = async (period: string) => {
        if (!period) return;
        setExporting(true);
        try {
            await gstApi.generateExport(period, 'gstr1_json');
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
