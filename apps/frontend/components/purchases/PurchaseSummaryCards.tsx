'use client';

import { IndianRupee, FileText, AlertCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PurchaseInvoiceFull } from '@/types';

const formatINR = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
    invoices: PurchaseInvoiceFull[];
}

export function PurchaseSummaryCards({ invoices }: Props) {
    if (!invoices || invoices.length === 0) {
        return (
            <div className="grid grid-cols-1 max-sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl max-sm:h-20" />
                ))}
            </div>
        );
    }

    // This-month filter
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisMonth = invoices.filter((inv) => inv.invoiceDate >= monthStart);

    const thisMonthTotal = thisMonth.reduce((s, inv) => s + inv.grandTotal, 0);
    const outstanding = invoices.reduce((s, inv) => s + inv.outstanding, 0);
    const overdueCount = invoices.filter(
        (inv) => inv.outstanding > 0 && inv.dueDate && inv.dueDate < now.toISOString().split('T')[0]
    ).length;
    const invoiceCount = thisMonth.length;

    return (
        <div className="grid grid-cols-1 max-sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
                icon={<TrendingUp className="text-blue-600 w-5 h-5" />}
                bg="bg-blue-100"
                title="This Month Total"
                value={formatINR(thisMonthTotal)}
                subtitle={`${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''}`}
            />
            <StatCard
                icon={<IndianRupee className="text-amber-600 w-5 h-5" />}
                bg="bg-amber-100"
                title="Outstanding"
                value={formatINR(outstanding)}
                subtitle="Unpaid amount"
            />
            <StatCard
                icon={<AlertCircle className="text-red-600 w-5 h-5" />}
                bg="bg-red-100"
                title="Overdue"
                value={String(overdueCount)}
                subtitle="Past due date"
                valueClass={overdueCount > 0 ? 'text-red-600' : undefined}
            />
            <StatCard
                icon={<FileText className="text-green-600 w-5 h-5" />}
                bg="bg-green-100"
                title="Invoice Count"
                value={String(invoiceCount)}
                subtitle="This month"
            />
        </div>
    );
}

function StatCard({
    icon,
    bg,
    title,
    value,
    subtitle,
    valueClass,
}: {
    icon: React.ReactNode;
    bg: string;
    title: string;
    value: string;
    subtitle: string;
    valueClass?: string;
}) {
    return (
        <Card>
            <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full flex items-center justify-center h-12 w-12 max-sm:hidden ${bg}`}>
                        {icon}
                    </div>
                    <div className="max-sm:min-w-0">
                        <p className="text-sm text-slate-500 font-medium">{title}</p>
                        <h3 className={`text-2xl max-sm:text-lg max-sm:break-words font-bold mt-1 ${valueClass ?? 'text-slate-900'}`}>{value}</h3>
                        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
