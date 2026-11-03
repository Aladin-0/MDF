'use client';

import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    BookOpen,
    CalendarDays,
    Download,
    FileSpreadsheet,
    Layers3,
    LockKeyhole,
    Package,
    Percent,
    ShieldCheck,
    ShoppingCart,
    TrendingDown,
    Undo2,
    type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

interface ReportWidgetData {
    href: string;
    icon: LucideIcon;
    title: string;
    description: string;
    iconBgColor: string;
}

interface ReportCategory {
    id: string;
    title: string;
    icon: LucideIcon;
    reports: ReportWidgetData[];
}

const REPORT_DIRECTORY: ReportCategory[] = [
    {
        id: 'sales-revenue',
        title: 'Sales & Revenue',
        icon: BarChart3,
        reports: [
            {
                href: '/dashboard/reports/sales-summary',
                icon: BarChart3,
                title: 'Sales Summary',
                description: 'Daily turnover and payment method breakdowns.',
                iconBgColor: 'bg-blue-50 text-blue-700',
            },
            {
                href: '/dashboard/reports/sales-book',
                icon: BookOpen,
                title: 'Sales Book',
                description: 'Bill-by-bill invoices with GST and round-off details.',
                iconBgColor: 'bg-indigo-50 text-indigo-700',
            },
            {
                href: '/dashboard/reports/erp-sales-book',
                icon: FileSpreadsheet,
                title: 'Consolidated Sales Book',
                description: 'Daily sales totals with returns adjustments.',
                iconBgColor: 'bg-violet-50 text-violet-700',
            },
            {
                href: '/dashboard/reports/erp-gross-profit',
                icon: Percent,
                title: 'Gross Profit',
                description: 'Revenue measured against the true cost of goods.',
                iconBgColor: 'bg-purple-50 text-purple-700',
            },
            {
                href: '/dashboard/reports/erp-sales-return-book',
                icon: Undo2,
                title: 'Sales Return Book',
                description: 'Credit notes, refunds, and reversed GST.',
                iconBgColor: 'bg-rose-50 text-rose-700',
            },
            {
                href: '/dashboard/reports/erp-gross-loss-return',
                icon: TrendingDown,
                title: 'Gross Loss on Return',
                description: 'Refunded revenue against reversed cost.',
                iconBgColor: 'bg-fuchsia-50 text-fuchsia-700',
            },
        ],
    },
    {
        id: 'purchases',
        title: 'Purchases',
        icon: ShoppingCart,
        reports: [
            {
                href: '/dashboard/reports/purchase-book',
                icon: ShoppingCart,
                title: 'Purchase Book',
                description: 'Bill-by-bill purchase invoices with GST and round-off details.',
                iconBgColor: 'bg-sky-50 text-sky-700',
            },
            {
                href: '/dashboard/reports/consolidated-purchase-book',
                icon: FileSpreadsheet,
                title: 'Consolidated Purchase Book',
                description: 'Daily purchase totals with returns adjustments.',
                iconBgColor: 'bg-cyan-50 text-cyan-700',
            },
            {
                href: '/dashboard/reports/purchase-return-book',
                icon: Undo2,
                title: 'Purchase Return Book',
                description: 'Debit notes to distributors and reversed GST input.',
                iconBgColor: 'bg-pink-50 text-pink-700',
            },
        ],
    },
    {
        id: 'inventory-stock',
        title: 'Inventory & Stock',
        icon: Package,
        reports: [
            {
                href: '/dashboard/reports/stock-valuation',
                icon: Package,
                title: 'Stock Valuation',
                description: 'Current inventory value by product and batch.',
                iconBgColor: 'bg-amber-50 text-amber-700',
            },
            {
                href: '/dashboard/reports/expiry-report',
                icon: AlertTriangle,
                title: 'Expiry Report',
                description: 'Expired and near-expiry stock at a glance.',
                iconBgColor: 'bg-orange-50 text-orange-700',
            },
            {
                href: '/dashboard/stockledger',
                icon: Layers3,
                title: 'Batch Tracking',
                description: 'Trace batch movements and transaction history.',
                iconBgColor: 'bg-yellow-50 text-yellow-800',
            },
        ],
    },
    {
        id: 'compliance',
        title: 'Compliance',
        icon: ShieldCheck,
        reports: [
            {
                href: '/dashboard/reports/schedule-drugs',
                icon: ShieldCheck,
                title: 'Schedule Drugs',
                description: 'Audit controlled-drug sales and purchases.',
                iconBgColor: 'bg-teal-50 text-teal-700',
            },
        ],
    },
];

interface MetricData {
    label: string;
    value: string;
    detail: string;
    icon: LucideIcon;
    iconColor: string;
    trend?: string;
    trendColor?: string;
}

const SAMPLE_METRICS: MetricData[] = [
    {
        label: 'Total Sales',
        value: '₹8,42,590',
        detail: 'Across all sales channels',
        icon: BarChart3,
        iconColor: 'bg-blue-50 text-blue-700',
        trend: '+12%',
        trendColor: 'bg-emerald-50 text-emerald-700',
    },
    {
        label: 'Gross Profit',
        value: '₹2,14,680',
        detail: 'Revenue after cost of goods',
        icon: Percent,
        iconColor: 'bg-violet-50 text-violet-700',
        trend: '+8.4%',
        trendColor: 'bg-violet-50 text-violet-700',
    },
    {
        label: 'Total Returns',
        value: '₹38,420',
        detail: 'Refunded sales value',
        icon: Undo2,
        iconColor: 'bg-rose-50 text-rose-700',
        trend: '+3.1%',
        trendColor: 'bg-rose-50 text-rose-700',
    },
    {
        label: 'Active Inventory',
        value: '1,284 items',
        detail: 'Valuation ₹19,76,300',
        icon: Package,
        iconColor: 'bg-amber-50 text-amber-700',
    },
];

function MetricWidget({ metric }: { metric: MetricData }) {
    const Icon = metric.icon;

    return (
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <span className={cn('inline-flex rounded-lg p-2.5', metric.iconColor)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {metric.trend && (
                    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold', metric.trendColor)}>
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        {metric.trend}
                    </span>
                )}
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{metric.value}</p>
            <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
        </div>
    );
}

function ReportWidget({ href, icon: Icon, title, description, iconBgColor }: ReportWidgetData) {
    return (
        <Link
            href={href}
            className="group flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-md hover:ring-1 hover:ring-purple-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
        >
            <div className="flex items-start justify-between gap-3">
                <span className={cn('inline-flex rounded-lg p-2.5', iconBgColor)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <ArrowRight className="h-4 w-4 text-purple-600 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 group-hover:text-purple-700">{title}</h3>
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{description}</p>
        </Link>
    );
}

export default function ReportsCenterPage() {
    const { hasPermission } = usePermissions();
    const canViewReports = hasPermission('view_reports');

    return (
        <div className="min-h-screen bg-slate-50/50 pb-12">
            <header className="border-b border-slate-200 bg-white px-5 py-6 sm:px-8">
                <div className="mx-auto flex max-w-[1600px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports & Analytics</h1>
                        <p className="mt-1 text-sm text-slate-500">Your workspace for sales, purchase, inventory, and compliance reports.</p>
                    </div>
                    {canViewReports && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="gap-2 border-slate-200 bg-white text-slate-700"
                                onClick={() => toast.info('Date filtering will be available when live dashboard metrics are connected.')}
                                aria-label="Preview date range: October 1 to October 31, 2026"
                            >
                                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                                Oct 1 – Oct 31, 2026
                            </Button>
                            <Button
                                type="button"
                                className="gap-2 bg-purple-700 text-white hover:bg-purple-800"
                                onClick={() => toast.info('Export All will be available when bulk report export is connected.')}
                            >
                                <Download className="h-4 w-4" aria-hidden="true" />
                                Export All
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            {!canViewReports ? (
                <main className="mx-auto max-w-[1600px] px-5 py-12 sm:px-8">
                    <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
                        <LockKeyhole className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                        <h2 className="mt-4 text-lg font-semibold text-slate-900">Access restricted</h2>
                        <p className="mt-2 text-sm text-slate-500">Ask your administrator for access to Reports & Analytics.</p>
                    </div>
                </main>
            ) : (
                <main className="mx-auto max-w-[1600px]">
                    <section className="px-5 py-8 sm:px-8" aria-labelledby="business-overview-heading">
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <h2 id="business-overview-heading" className="text-lg font-bold text-slate-900">Business overview</h2>
                            <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">Sample data</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                            {SAMPLE_METRICS.map((metric) => <MetricWidget key={metric.label} metric={metric} />)}
                        </div>
                    </section>

                    <div className="space-y-10 px-5 sm:px-8">
                        {REPORT_DIRECTORY.map((category) => {
                            const Icon = category.icon;
                            return (
                                <section key={category.id} aria-labelledby={`${category.id}-heading`}>
                                    <div className="mb-4 flex items-center gap-3">
                                        <span className="inline-flex rounded-lg bg-purple-50 p-2 text-purple-700">
                                            <Icon className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                        <h2 id={`${category.id}-heading`} className="text-lg font-bold text-slate-900">{category.title}</h2>
                                        <span className="text-xs font-medium text-slate-400">{category.reports.length}</span>
                                        <div className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {category.reports.map((report) => <ReportWidget key={report.href} {...report} />)}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                </main>
            )}
        </div>
    );
}
