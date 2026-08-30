'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Play, Loader2, FileSpreadsheet } from 'lucide-react';
import { useReactTable, getCoreRowModel, createColumnHelper, flexRender } from '@tanstack/react-table';
import { toast } from 'sonner';
import { gstApi } from '@/lib/apiClient';
import { useGSTStore } from '@/store/gstStore';
import { ReportFilterRibbon } from '@/components/gst/ReportFilterRibbon';

type ReconciliationRow = {
  id: string;
  supplier_name: string;
  supplier_gstin: string;
  invoice_no: string;
  invoice_date: string;
  pr_taxable: number;
  gstr2b_taxable: number;
  pr_itc: number;
  gstr2b_itc: number;
  status: 'MATCHED' | 'MISMATCHED' | 'MISSING_IN_2B' | 'MISSING_IN_PR';
};

const colHelper = createColumnHelper<ReconciliationRow>();

export default function ReconciliationPage() {
  const [loading, setLoading] = useState(false);
  const [reconData, setReconData] = useState<ReconciliationRow[]>([]);
  
  // Ribbon filter states
  const [reportType, setReportType] = useState('all');
  const [taxFilter, setTaxFilter] = useState('all');

  const { selectedPeriod: period } = useGSTStore();

  const loadData = useCallback(async () => {
    if (!period) return;
    try {
        const data = await gstApi.getGSTR2BReconciliationData(period);
        setReconData(data);
    } catch (e) {
        console.error(e);
        toast.error("Failed to load comparative reconciliation data.");
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunRecon = async () => {
    setLoading(true);
    try {
      if (!period) throw new Error("No period selected");
      await gstApi.runSandboxGstr2bReconciliation(period);
      toast.success('Reconciliation completed successfully.');
      await loadData(); // refresh table
    } catch (error: any) {
      toast.error(error?.detail || error?.message || 'Failed to run reconciliation');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MATCHED':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none">Matched</Badge>;
      case 'MISMATCHED':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">Mismatched</Badge>;
      case 'MISSING_IN_2B':
        return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-none">Missing in 2B</Badge>;
      case 'MISSING_IN_PR':
        return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100 border-none">Missing in PR</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const columns = useMemo(() => [
    colHelper.accessor('supplier_name', {
      header: 'Supplier Details',
      cell: info => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{info.getValue()}</span>
          <span className="text-xs text-slate-500 font-mono">{info.row.original.supplier_gstin}</span>
        </div>
      ),
      meta: { align: 'left' }
    }),
    colHelper.accessor('invoice_no', {
      header: 'Invoice No & Date',
      cell: info => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{info.getValue()}</span>
          <span className="text-xs text-slate-500">{info.row.original.invoice_date}</span>
        </div>
      ),
      meta: { align: 'left' }
    }),
    colHelper.display({
      id: 'taxable',
      header: 'PR Taxable vs 2B Taxable',
      cell: info => (
        <div className="flex flex-col text-right">
          <span className="text-slate-900">₹{info.row.original.pr_taxable.toFixed(2)}</span>
          <span className="text-xs text-slate-500">₹{info.row.original.gstr2b_taxable.toFixed(2)}</span>
        </div>
      ),
      meta: { align: 'right' }
    }),
    colHelper.display({
      id: 'itc',
      header: 'PR ITC vs 2B ITC',
      cell: info => (
        <div className="flex flex-col text-right">
          <span className="text-slate-900">₹{info.row.original.pr_itc.toFixed(2)}</span>
          <span className="text-xs text-slate-500">₹{info.row.original.gstr2b_itc.toFixed(2)}</span>
        </div>
      ),
      meta: { align: 'right' }
    }),
    colHelper.accessor('status', {
      header: 'Recon Status',
      cell: info => (
        <div className="flex justify-center">
          {getStatusBadge(info.getValue())}
        </div>
      ),
      meta: { align: 'center' }
    })
  ], []);

  const table = useReactTable({
    data: reconData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totals = useMemo(() => {
    return reconData.reduce((acc, row) => ({
      pr_taxable: acc.pr_taxable + row.pr_taxable,
      gstr2b_taxable: acc.gstr2b_taxable + row.gstr2b_taxable,
      pr_itc: acc.pr_itc + row.pr_itc,
      gstr2b_itc: acc.gstr2b_itc + row.gstr2b_itc,
    }), { pr_taxable: 0, gstr2b_taxable: 0, pr_itc: 0, gstr2b_itc: 0 });
  }, [reconData]);

  const SyncButton = (
    <Button 
      variant="default" 
      size="sm" 
      onClick={handleRunRecon}
      disabled={loading || !period}
      className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 shadow-sm"
    >
      {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
      {loading ? 'Syncing...' : 'Sync with GST Portal'}
    </Button>
  );

  return (
    <div className="space-y-4 max-w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">GSTR-2B Reconciliation</h1>
          <p className="text-sm text-slate-500">Match GSTR-2B fetched data against your Purchase Records.</p>
        </div>
      </div>

      <ReportFilterRibbon 
        reportType={reportType}
        setReportType={setReportType}
        taxFilter={taxFilter}
        setTaxFilter={setTaxFilter}
        customActionRight={SyncButton}
        excelDownloadLabel="Download Reconciliation Audit Report (.xlsx)"
        excelDownloadIcon={<FileSpreadsheet className="mr-2 h-4 w-4" />}
        onSearch={() => toast('Filters applied')}
        onPrint={() => window.print()}
        onDownloadExcel={async () => {
          if (!period) return;
          try {
            await gstApi.generateReconciliationExport(period);
            toast.success('Reconciliation Audit Excel generated successfully');
          } catch (e: any) {
            toast.error(e.message || 'Failed to generate Reconciliation Audit Excel');
          }
        }}
        onDownloadJson={async () => {
          if (!period) return;
          try {
            await gstApi.generateExport(period, 'gstr2b_json');
            toast.success('JSON export generated successfully.');
          } catch (e: any) {
            toast.error(e?.detail || 'Failed to generate JSON export.');
          }
        }}
        exportDisabled={!period || reconData.length === 0}
      />

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
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse bg-slate-50/50">
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div><div className="h-3 bg-slate-200 rounded w-1/2"></div></td>
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div><div className="h-3 bg-slate-200 rounded w-1/2"></div></td>
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-full mb-2"></div><div className="h-3 bg-slate-200 rounded w-full"></div></td>
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-full mb-2"></div><div className="h-3 bg-slate-200 rounded w-full"></div></td>
                    <td className="py-3 px-3"><div className="h-6 bg-slate-200 rounded-full w-24 mx-auto"></div></td>
                  </tr>
                ))
              ) : reconData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <FileSpreadsheet className="h-12 w-12 text-slate-300 mb-3" />
                      <p className="text-lg font-medium text-slate-900">No reconciliation records found for this period</p>
                      <p className="text-sm mt-1">Try syncing with GST Portal or selecting a different period.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                    {row.getVisibleCells().map(cell => {
                      const align = (cell.column.columnDef.meta as any)?.align || 'left';
                      return (
                        <td 
                          key={cell.id} 
                          className={`py-1.5 px-3 whitespace-nowrap text-${align} text-slate-600 align-middle`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200 sticky bottom-0 font-semibold text-slate-900">
              <tr>
                <td className="py-2 px-3">Totals</td>
                <td className="py-2 px-3"></td>
                <td className="py-2 px-3 text-right">
                  <div className="flex flex-col">
                    <span>₹{totals.pr_taxable.toFixed(2)}</span>
                    <span className="text-xs text-slate-500">₹{totals.gstr2b_taxable.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <div className="flex flex-col">
                    <span>₹{totals.pr_itc.toFixed(2)}</span>
                    <span className="text-xs text-slate-500">₹{totals.gstr2b_itc.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2 px-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
