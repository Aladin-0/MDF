'use client';

import { useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { SalesReportTab } from '@/components/reports/SalesReportTab';
import { Input } from '@/components/ui/input';
import type { DateRangeFilter } from '@/types';

export default function SalesSummaryPage() {
    const [dateRange, setDateRange] = useState<DateRangeFilter>(() => {
        const today = new Date();
        return {
            from: format(startOfMonth(today), 'yyyy-MM-dd'),
            to: format(today, 'yyyy-MM-dd'),
            period: 'custom',
        };
    });

    return (
        <ReportPageLayout
            title="Sales Summary"
            description="Daily sales volume, payment methods, and revenue trends."
            breadcrumbs={[
                { label: 'Reports', href: '/dashboard/reports' },
                { label: 'Sales Summary' },
            ]}
            parameterBar={
                <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="sales-summary-from" className="text-sm text-slate-600">From</label>
                    <Input id="sales-summary-from" type="date" value={dateRange.from}
                        onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
                        className="w-40 bg-white" />
                    <label htmlFor="sales-summary-to" className="text-sm text-slate-600">To</label>
                    <Input id="sales-summary-to" type="date" value={dateRange.to}
                        onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                        className="w-40 bg-white" />
                </div>
            }
        >
            <SalesReportTab dateRange={dateRange} />
        </ReportPageLayout>
    );
}
