import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Search, Printer, Download, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ReportFilterRibbonProps {
  reportType: string;
  setReportType: (val: string) => void;
  taxFilter: string;
  setTaxFilter: (val: string) => void;
  onSearch?: (period: string) => void;
  onPrint?: () => void;
  onDownloadExcel?: (period: string) => void;
  onDownloadJson?: (period: string) => void;
  isExporting?: boolean;
  exportDisabled?: boolean;
  customActionRight?: React.ReactNode;
  excelDownloadLabel?: string;
  excelDownloadIcon?: React.ReactNode;
}

export function ReportFilterRibbon({
  reportType,
  setReportType,
  taxFilter,
  setTaxFilter,
  onSearch,
  onPrint,
  onDownloadExcel,
  onDownloadJson,
  isExporting,
  exportDisabled,
  customActionRight,
  excelDownloadLabel = "Export to Excel Utility Template",
  excelDownloadIcon = <Download className="mr-2 h-4 w-4" />
}: ReportFilterRibbonProps) {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const deriveGstPeriod = (start: string, end: string) => {
    if (!start || !end) throw new Error("Please select both start and end dates.");
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (startDate.getMonth() !== endDate.getMonth() || startDate.getFullYear() !== endDate.getFullYear()) {
        throw new Error("GST exports require a single calendar month selection.");
    }
    
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const year = startDate.getFullYear();
    return `${month}${year}`;
  };

  const handleSearch = () => {
    try {
      const period = deriveGstPeriod(fromDate, toDate);
      if (onSearch) onSearch(period);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Search Failed', description: e.message });
    }
  };

  const handleDownloadExcel = () => {
    try {
      const period = deriveGstPeriod(fromDate, toDate);
      if (onDownloadExcel) onDownloadExcel(period);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: e.message });
    }
  };

  const handleDownloadJson = () => {
    try {
      const period = deriveGstPeriod(fromDate, toDate);
      if (onDownloadJson) onDownloadJson(period);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: e.message });
    }
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center bg-white border border-slate-200 rounded-md p-2 shadow-sm mb-4 gap-4">
      {/* Left Group: Filters */}
      <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto">
        <div className="flex items-center gap-2">
            <input 
                type="date" 
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <span className="text-slate-500 text-sm">to</span>
            <input 
                type="date" 
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
        </div>
        
        <select 
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="all">Report Type: All</option>
          <option value="b2b">B2B (Registered)</option>
          <option value="b2c">B2C (Unregistered)</option>
        </select>
        
        <select 
          value={taxFilter}
          onChange={(e) => setTaxFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="all">Tax Filter: All</option>
          <option value="with_gst">With GST</option>
          <option value="without_gst">Without GST</option>
        </select>

        <Button 
          variant="default" 
          size="sm" 
          onClick={handleSearch}
          className="bg-purple-600 hover:bg-purple-700 text-white shrink-0 h-8"
        >
          <Search className="w-4 h-4 mr-1.5" />
          Search
        </Button>
      </div>

      {/* Right Group: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        
        {customActionRight}

        <Button 
          variant="outline" 
          size="sm" 
          onClick={onPrint}
          className="h-8 border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <Printer className="w-4 h-4 mr-1.5" />
          Print
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="default" 
              size="sm"
              disabled={exportDisabled || isExporting}
              className="bg-purple-600 hover:bg-purple-700 text-white h-8"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {isExporting ? 'Generating...' : 'Download'}
              <ChevronDown className="w-3 h-3 ml-1.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={handleDownloadExcel}>
              {excelDownloadIcon}
              {excelDownloadLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadJson}>
              <Download className="mr-2 h-4 w-4" />
              Export to JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
