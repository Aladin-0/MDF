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

// Define Table 3.1 Row shape
type Table31Row = {
  nature: string;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

// Define Table 4 Row shape
type Table4Row = {
  details: string;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

const col31 = createColumnHelper<Table31Row>();
const col4 = createColumnHelper<Table4Row>();

export default function GSTR3BPage() {
    
    const [summaryData, setSummaryData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const { toast } = useToast();

    // Ribbons dummy state since GSTR-3B filtering is mostly period based for now
    const [reportType, setReportType] = useState('all');
    const [taxFilter, setTaxFilter] = useState('all');

    const loadDashboardData = useCallback(async (start?: string, end?: string) => {
        if (!start || !end) return;
        setLoading(true);
        try {
            const summary = await gstApi.getSummary(start, end);
            setSummaryData(summary);
        } catch (error) {
            console.error("Failed to load dashboard data", error);
            toast({ variant: 'destructive', title: 'Failed to load dashboard data' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        // loadDashboardData(); // Initial load skipped since we need explicit dates
    }, [loadDashboardData]);

    // Data for Table 3.1
    const data31 = useMemo(() => {
        if (!summaryData?.gstr3b?.sup_details) return [];
        const sup = summaryData.gstr3b.sup_details;
        
        return [
            {
                nature: '(a) Outward taxable supplies (other than zero rated, nil rated and exempted)',
                txval: sup.osup_det?.txval || 0,
                iamt: sup.osup_det?.iamt || 0,
                camt: sup.osup_det?.camt || 0,
                samt: sup.osup_det?.samt || 0,
                csamt: sup.osup_det?.csamt || 0
            },
            {
                nature: '(b) Outward taxable supplies (zero rated)',
                txval: sup.osup_zero?.txval || 0,
                iamt: sup.osup_zero?.iamt || 0,
                camt: 0,
                samt: 0,
                csamt: sup.osup_zero?.csamt || 0
            },
            {
                nature: '(c) Other outward supplies (Nil rated, exempted)',
                txval: sup.osup_nil_exmp?.txval || 0,
                iamt: 0,
                camt: 0,
                samt: 0,
                csamt: sup.osup_nil_exmp?.csamt || 0
            },
            {
                nature: '(d) Inward supplies (liable to reverse charge)',
                txval: sup.isup_rev?.txval || 0,
                iamt: sup.isup_rev?.iamt || 0,
                camt: sup.isup_rev?.camt || 0,
                samt: sup.isup_rev?.samt || 0,
                csamt: sup.isup_rev?.csamt || 0
            },
            {
                nature: '(e) Non-GST outward supplies',
                txval: sup.osup_nongst?.txval || 0,
                iamt: 0,
                camt: 0,
                samt: 0,
                csamt: sup.osup_nongst?.csamt || 0
            }
        ];
    }, [summaryData]);

    const columns31 = useMemo(() => [
        col31.accessor('nature', { header: 'Nature of Supplies', meta: { align: 'left' } }),
        col31.accessor('txval', { header: 'Total Taxable Value', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col31.accessor('iamt', { header: 'Integrated Tax', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col31.accessor('camt', { header: 'Central Tax', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col31.accessor('samt', { header: 'State/UT Tax', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col31.accessor('csamt', { header: 'Cess', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
    ], []);

    const table31 = useReactTable({
        data: data31,
        columns: columns31,
        getCoreRowModel: getCoreRowModel(),
    });

    const totals31 = useMemo(() => {
        return data31.reduce((acc, row) => ({
            txval: acc.txval + row.txval,
            iamt: acc.iamt + row.iamt,
            camt: acc.camt + row.camt,
            samt: acc.samt + row.samt,
            csamt: acc.csamt + row.csamt,
        }), { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
    }, [data31]);


    // Data for Table 4
    const data4 = useMemo(() => {
        if (!summaryData?.gstr3b?.itc_elg) return [];
        const itc_avl = summaryData.gstr3b.itc_elg.itc_avl || [];
        
        // Match the items from the backend array
        const getRow = (name: string) => {
            const found = itc_avl.find((x: any) => x.ty === name) || {};
            return {
                details: name,
                iamt: found.iamt || 0,
                camt: found.camt || 0,
                samt: found.samt || 0,
                csamt: found.csamt || 0,
            };
        };

        return [
            getRow('Import of Goods'),
            getRow('Import of Services'),
            getRow('Inward supplies liable to reverse charge'),
            getRow('Inward supplies from ISD'),
            getRow('All other ITC')
        ];
    }, [summaryData]);

    const columns4 = useMemo(() => [
        col4.accessor('details', { header: 'Details', meta: { align: 'left' } }),
        col4.accessor('iamt', { header: 'Integrated Tax', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col4.accessor('camt', { header: 'Central Tax', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col4.accessor('samt', { header: 'State/UT Tax', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
        col4.accessor('csamt', { header: 'Cess', cell: info => info.getValue().toFixed(2), meta: { align: 'right' } }),
    ], []);

    const table4 = useReactTable({
        data: data4,
        columns: columns4,
        getCoreRowModel: getCoreRowModel(),
    });

    const totals4 = useMemo(() => {
        return data4.reduce((acc, row) => ({
            iamt: acc.iamt + row.iamt,
            camt: acc.camt + row.camt,
            samt: acc.samt + row.samt,
            csamt: acc.csamt + row.csamt,
        }), { iamt: 0, camt: 0, samt: 0, csamt: 0 });
    }, [data4]);


    const handleExportExcel = async (period: string) => {
        if (!period) return;
        setExporting(true);
        try {
            await gstApi.generateExport(period, 'gstr3b_excel');
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
            await gstApi.generateExport(period, 'gstr3b_json');
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
                    <h1 className="text-2xl font-bold text-slate-900">GSTR-3B Management</h1>
                    <p className="text-sm text-slate-500">Review outward tax, ITC, and generate the official Offline Utility .xlsm.</p>
                </div>
            </div>

            <ReportFilterRibbon 
              reportType={reportType}
              setReportType={setReportType}
              taxFilter={taxFilter}
              setTaxFilter={setTaxFilter}
              onSearch={(start, end) => loadDashboardData(start, end)}
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

                    {/* TABLE 3.1 */}
                    <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col mb-6">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                          <h2 className="text-base font-semibold text-slate-800">3.1 Details of Outward Supplies and inward supplies liable to reverse charge</h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                          <thead className="text-xs text-slate-700 bg-slate-100 uppercase border-b border-slate-200 sticky top-0">
                            {table31.getHeaderGroups().map(headerGroup => (
                              <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => {
                                  const align = (header.column.columnDef.meta as any)?.align || 'left';
                                  return (
                                    <th 
                                      key={header.id} 
                                      className={`py-2 px-3 font-semibold whitespace-nowrap text-${align}`}
                                    >
                                      {flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                  );
                                })}
                              </tr>
                            ))}
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {table31.getRowModel().rows.map(row => (
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
                              <td className="py-2 px-3">Totals</td>
                              <td className="py-2 px-3 text-right">{totals31.txval.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals31.iamt.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals31.camt.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals31.samt.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals31.csamt.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                    
                    {/* TABLE 4 */}
                    <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                          <h2 className="text-base font-semibold text-slate-800">4. Eligible ITC</h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                          <thead className="text-xs text-slate-700 bg-slate-100 uppercase border-b border-slate-200 sticky top-0">
                            {table4.getHeaderGroups().map(headerGroup => (
                              <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => {
                                  const align = (header.column.columnDef.meta as any)?.align || 'left';
                                  return (
                                    <th 
                                      key={header.id} 
                                      className={`py-2 px-3 font-semibold whitespace-nowrap text-${align}`}
                                    >
                                      {flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                  );
                                })}
                              </tr>
                            ))}
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {table4.getRowModel().rows.map(row => (
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
                              <td className="py-2 px-3">Totals</td>
                              <td className="py-2 px-3 text-right">{totals4.iamt.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals4.camt.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals4.samt.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right">{totals4.csamt.toFixed(2)}</td>
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
