'use client';

import { useState, useEffect, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { gstApi } from '@/lib/apiClient';
import { ReportFilterRibbon } from '@/components/gst/ReportFilterRibbon';

interface GSTR2AWarningRow {
  supplier_name: string;
  invoice_no: string;
  pr_taxable: number;
  pr_itc: number;
  portal_status: string;
}

export default function GSTR2APage() {
  const [period, setPeriod] = useState<string>('082026');
  const [reportType, setReportType] = useState('all');
  const [taxFilter, setTaxFilter] = useState('all');
  
  const [warningData, setWarningData] = useState<GSTR2AWarningRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!period) return;
    try {
      setLoading(true);
      const data = await gstApi.getGstr2aWarning(period);
      setWarningData(data);
    } catch (error: any) {
      toast.error('Failed to fetch GSTR-2A data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  const handleFetchLive2A = async () => {
    await loadData();
    toast.success('Live GSTR-2A data fetched successfully.');
  };

  const getStatusBadge = (status: string) => {
    if (status === 'PENDING_SUPPLIER_UPLOAD') {
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">Pending Supplier Upload</Badge>;
    }
    if (status === 'UPLOADED') {
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none">Uploaded</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const colHelper = createColumnHelper<GSTR2AWarningRow>();

  const columns = useMemo(() => [
    colHelper.accessor('supplier_name', {
      header: 'Supplier Details',
      cell: info => (
        <span className="font-semibold text-slate-900">{info.getValue()}</span>
      ),
      meta: { align: 'left' }
    }),
    colHelper.accessor('invoice_no', {
      header: 'Invoice No',
      cell: info => (
        <span className="font-medium text-slate-900">{info.getValue()}</span>
      ),
      meta: { align: 'left' }
    }),
    colHelper.accessor('pr_itc', {
      header: 'Expected ITC',
      cell: info => (
        <span className="text-slate-900 font-medium">₹{info.getValue().toFixed(2)}</span>
      ),
      meta: { align: 'right' }
    }),
    colHelper.accessor('portal_status', {
      header: 'Upload Status',
      cell: info => (
        <div className="flex justify-center">
          {getStatusBadge(info.getValue())}
        </div>
      ),
      meta: { align: 'center' }
    })
  ], []);

  const table = useReactTable({
    data: warningData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totals = useMemo(() => {
    return warningData.reduce((acc, row) => ({
      pr_taxable: acc.pr_taxable + row.pr_taxable,
      pr_itc: acc.pr_itc + row.pr_itc,
    }), { pr_taxable: 0, pr_itc: 0 });
  }, [warningData]);

  const FetchButton = (
    <Button
      variant="default"
      size="sm"
      onClick={handleFetchLive2A}
      disabled={loading || !period}
      className="bg-blue-600 hover:bg-blue-700 text-white h-8 shadow-sm"
    >
      {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
      {loading ? 'Fetching...' : 'Fetch Live 2A Data'}
    </Button>
  );

  return (
    <div className="space-y-4 max-w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">GSTR-2A Early Warning</h1>
          <p className="text-sm text-slate-500">Compare live GSTR-2A sandbox data against your Purchase Records.</p>
        </div>
      </div>

      <ReportFilterRibbon
        reportType={reportType}
        setReportType={setReportType}
        taxFilter={taxFilter}
        setTaxFilter={setTaxFilter}
        customActionRight={FetchButton}
        onSearch={(start, end) => toast('Filters applied')}
        onPrint={() => window.print()}
        exportDisabled={true}
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
              {table.getRowModel().rows.map(row => (
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
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200 sticky bottom-0 font-semibold text-slate-900">
              <tr>
                <td className="py-2 px-3">Totals</td>
                <td className="py-2 px-3"></td>
                <td className="py-2 px-3 text-right">
                  <span>₹{totals.pr_itc.toFixed(2)}</span>
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
