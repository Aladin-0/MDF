import React from 'react';
import { useGSTStore } from '@/store/gstStore';
import { GSTPeriodSelector } from './GSTPeriodSelector';
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
  const { selectedPeriod } = useGSTStore();

  const handleSearch = () => {
    if (!selectedPeriod) {
      toast({ variant: 'destructive', title: 'Search Failed', description: 'Please select a GST period.' });
      return;
    }
    if (onSearch) onSearch(selectedPeriod);
  };

  const handleDownloadExcel = () => {
    if (!selectedPeriod) {
      toast({ variant: 'destructive', title: 'Export Failed', description: 'Please select a GST period.' });
      return;
    }
    if (onDownloadExcel) onDownloadExcel(selectedPeriod);
  };

  const handleDownloadJson = () => {
    if (!selectedPeriod) {
      toast({ variant: 'destructive', title: 'Export Failed', description: 'Please select a GST period.' });
      return;
    }
    if (onDownloadJson) onDownloadJson(selectedPeriod);
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center bg-white border border-slate-200 rounded-md p-2 shadow-sm mb-4 gap-4">
      {/* Left Group: Filters */}
      <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto">
        <div className="flex items-center gap-2">
            <GSTPeriodSelector />
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
