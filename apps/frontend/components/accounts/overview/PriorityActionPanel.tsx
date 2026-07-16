'use client';

import { useDashboardUrgentActions } from '@/hooks/useAccounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowRight, FileText, Scale } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ActionItemProps {
    title: string;
    description: string;
    icon: React.ElementType;
    count: number;
    href: string;
    variant: 'danger' | 'warning' | 'info';
}

function ActionItem({ title, description, icon: Icon, count, href, variant }: ActionItemProps) {
    if (count === 0) return null;

    const colors = {
        danger: 'bg-red-50 text-red-600 border-red-200',
        warning: 'bg-amber-50 text-amber-600 border-amber-200',
        info: 'bg-blue-50 text-blue-600 border-blue-200',
    };

    return (
        <div className={cn("flex items-center justify-between p-3 border rounded-lg", colors[variant])}>
            <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                <div>
                    <p className="font-semibold text-sm">
                        {count} {title}
                    </p>
                    <p className="text-xs opacity-80">{description}</p>
                </div>
            </div>
            <Link href={href} className="text-xs font-medium hover:underline flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
            </Link>
        </div>
    );
}

export function PriorityActionPanel() {
    const { data, isLoading } = useDashboardUrgentActions();

    if (isLoading) {
        return <Skeleton className="h-64 w-full" />;
    }

    const hasActions = 
        (data?.overdueDistributorBills || 0) > 0 || 
        (data?.overdueCustomerBills || 0) > 0 ||
        (data?.vouchersToday || 0) > 0 ||
        (data?.reconciliationMismatches || 0) > 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    Needs Attention Today
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!hasActions ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                        <p className="text-sm font-medium text-foreground">You're all caught up!</p>
                        <p className="text-xs">No urgent actions required today.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <ActionItem
                            title="Overdue Distributor Bills"
                            description="Bills that missed their due date."
                            icon={AlertCircle}
                            count={data.overdueDistributorBills}
                            href="/dashboard/accounts/payables"
                            variant="danger"
                        />
                        <ActionItem
                            title="Overdue Collections"
                            description="Customer dues older than 30 days."
                            icon={AlertCircle}
                            count={data.overdueCustomerBills}
                            href="/dashboard/accounts/receivables"
                            variant="warning"
                        />
                        <ActionItem
                            title="Vouchers Created Today"
                            description="Vouchers that may need review."
                            icon={FileText}
                            count={data.vouchersToday}
                            href="/dashboard/accounts/voucher-entry"
                            variant="info"
                        />
                        <ActionItem
                            title="Reconciliation Mismatches"
                            description="Journal entries that do not match ledgers."
                            icon={Scale}
                            count={data.reconciliationMismatches}
                            href="/dashboard/accounts/reconciliation"
                            variant="danger"
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

import { CheckCircle2 } from 'lucide-react';
