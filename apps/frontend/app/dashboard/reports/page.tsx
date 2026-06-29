'use client';

import { useState, useCallback } from 'react';
import { BarChart3, FileText, Package, AlertTriangle, Users, ShoppingCart, Lock, AlertCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { DateRangePicker } from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { SalesReportTab } from '@/components/reports/SalesReportTab';
import { GSTReportTab } from '@/components/reports/GSTReportTab';
import { StockValuationTab } from '@/components/reports/StockValuationTab';
import { ExpiryReportTab } from '@/components/reports/ExpiryReportTab';
import { StaffReportTab } from '@/components/reports/StaffReportTab';
import { PurchaseReportTab } from '@/components/reports/PurchaseReportTab';
import { ScheduleReportTab } from '@/components/reports/ScheduleReportTab';
import { BatchReportTab } from '@/components/reports/BatchReportTab';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { getDefaultDateRange, getDateRangeForPeriod } from '@/hooks/useReports';
import { DateRangeFilter } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';

type ReportTab = 'sales' | 'gst' | 'stock' | 'expiry' | 'staff' | 'purchases' | 'schedule' | 'batch';

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<ReportTab>('sales');
    const [dateRange, setDateRange] = useState<DateRangeFilter>(getDefaultDateRange);
    const [batchFilters, setBatchFilters] = useState({
        reportType: 'current_stock',
        search: '',
        expiryWithinDays: '90'
    });
    const { hasPermission } = usePermissions();

    const handleExport = useCallback(() => {
        // Trigger export dropdown — handled inside ExportButton
    }, []);

    useKeyboardShortcuts({
        '1': () => setActiveTab('sales'),
        '2': () => setActiveTab('gst'),
        '3': () => setActiveTab('stock'),
        '4': () => setActiveTab('expiry'),
        '5': () => setActiveTab('staff'),
        '6': () => setActiveTab('purchases'),
        '7': () => setActiveTab('schedule'),
        'm': () => setDateRange(getDateRangeForPeriod('this_month')),
        'w': () => setDateRange(getDateRangeForPeriod('this_week')),
    });

    if (!hasPermission('view_reports')) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Sales, GST, stock valuation and staff performance reports
                    </p>
                </div>
                <Card className="border-dashed border-2 border-slate-200">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                            <Lock className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700">Access Restricted</h3>
                        <p className="text-muted-foreground text-sm mt-2 max-w-sm">
                            Ask your admin for access to reports.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Sales, GST, inventory, and staff performance reports
                    </p>
                </div>
                <PermissionGate permission="export_reports">
                    <ExportButton activeTab={activeTab} dateRange={dateRange} batchFilters={batchFilters} />
                </PermissionGate>
            </div>

            {/* Date range picker */}
            <div className="bg-white rounded-xl border p-4">
                <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            {/* Keyboard hint bar */}
            <p className="text-xs text-muted-foreground px-1">
                <span className="font-mono bg-slate-100 px-1 rounded">1–7</span> Switch tabs
                · <span className="font-mono bg-slate-100 px-1 rounded">M</span> This month
                · <span className="font-mono bg-slate-100 px-1 rounded">W</span> This week
                · <span className="font-mono bg-slate-100 px-1 rounded">E</span> Export
            </p>

            {/* Report tabs */}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ReportTab)}>
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="sales">
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Sales Report
                    </TabsTrigger>
                    <TabsTrigger value="gst">
                        <FileText className="w-3 h-3 mr-1" />
                        GST Report
                    </TabsTrigger>
                    <TabsTrigger value="stock">
                        <Package className="w-3 h-3 mr-1" />
                        Stock Valuation
                    </TabsTrigger>
                    <TabsTrigger value="expiry">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-500" />
                        Expiry Report
                    </TabsTrigger>
                    <TabsTrigger value="staff">
                        <Users className="w-3 h-3 mr-1" />
                        Staff Report
                    </TabsTrigger>
                    <TabsTrigger value="purchases">
                        <ShoppingCart className="w-3 h-3 mr-1" />
                        Purchase Report
                    </TabsTrigger>
                    <TabsTrigger value="schedule">
                        <AlertCircle className="w-3 h-3 mr-1 text-rose-500" />
                        Schedule Drugs
                    </TabsTrigger>
                    <TabsTrigger value="batch">
                        <Package className="w-3 h-3 mr-1 text-indigo-500" />
                        Batch Tracking
                    </TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    <TabsContent value="sales" className="mt-0 outline-none">
                        <SalesReportTab dateRange={dateRange} />
                    </TabsContent>
                    <TabsContent value="gst" className="mt-0 outline-none">
                        <GSTReportTab dateRange={dateRange} />
                    </TabsContent>
                    <TabsContent value="stock" className="mt-0 outline-none">
                        <StockValuationTab />
                    </TabsContent>
                    <TabsContent value="expiry" className="mt-0 outline-none">
                        <ExpiryReportTab />
                    </TabsContent>
                    <TabsContent value="staff" className="mt-0 outline-none">
                        <StaffReportTab dateRange={dateRange} />
                    </TabsContent>
                    <TabsContent value="purchases" className="mt-0 outline-none">
                        <PurchaseReportTab dateRange={dateRange} />
                    </TabsContent>
                    <TabsContent value="schedule" className="mt-0 outline-none">
                        <ScheduleReportTab />
                    </TabsContent>
                    <TabsContent value="batch" className="mt-0 outline-none">
                        <BatchReportTab 
                            dateRange={dateRange} 
                            filters={batchFilters} 
                            onFiltersChange={setBatchFilters} 
                        />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
