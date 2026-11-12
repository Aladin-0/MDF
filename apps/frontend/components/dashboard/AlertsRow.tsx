'use client';

import { AlertTriangle, BadgeAlert, PackageX } from 'lucide-react';
import { DashboardAlerts } from '@/types';
import { rupees } from '@/lib/dashboard';
import { AlertCard, AlertCardSkeleton, AlertItem } from './AlertCard';

interface AlertsRowProps {
    alerts?: DashboardAlerts;
    isLoading?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function expiryStatus(days: number): { status: string; tone: AlertItem['tone'] } {
    if (days < 0) return { status: `Expired ${Math.abs(days)}d ago`, tone: 'danger' };
    if (days === 0) return { status: 'Expires today', tone: 'danger' };
    return { status: `${days}d left`, tone: days <= 30 ? 'danger' : 'warning' };
}

/**
 * What needs doing: low stock, stock about to expire (or already expired) and overdue credit. Each card shows the
 * worst three and the true total; with nothing wrong it is one quiet line.
 */
export default function AlertsRow({ alerts, isLoading }: AlertsRowProps) {
    if (isLoading || !alerts) {
        return (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <AlertCardSkeleton /><AlertCardSkeleton /><AlertCardSkeleton />
            </div>
        );
    }

    // `counts` is the truth; the lists are only the worst few (older servers sent no counts: fall back to the list)
    const lowCount = alerts.counts?.lowStock ?? alerts.lowStock.length;
    const expCount = alerts.counts?.expiringSoon ?? alerts.expiringSoon.length;
    const overdueCount = alerts.counts?.overdueAccounts ?? alerts.overdueAccounts.length;
    const overdueAmount = alerts.counts?.overdueAmount ?? alerts.overdueAccounts.reduce((sum, a) => sum + a.outstandingAmount, 0);

    const lowItems: AlertItem[] = alerts.lowStock.map((p, i) => ({
        key: p.productId ?? `low-${i}`,
        label: p.productName ?? p.batch?.productName ?? 'Product',
        sublabel: `${p.currentStock} in stock · reorder below ${p.reorderLevel}`,
        status: p.currentStock <= 0 ? 'Out of stock' : 'Low',
        tone: p.currentStock <= 0 ? 'danger' : 'warning',
        href: p.productId ? `/dashboard/inventory/${p.productId}` : undefined,
    }));
    const expiringItems: AlertItem[] = alerts.expiringSoon.map((e, i) => ({
        key: `${e.productId ?? 'exp'}-${e.batch.batchNumber}-${i}`,
        label: e.batch.productName,
        sublabel: `Batch ${e.batch.batchNumber} · expires ${e.batch.expiryDate}`,
        ...expiryStatus(e.daysUntilExpiry),
        href: e.productId ? `/dashboard/inventory/${e.productId}` : undefined,
    }));
    const overdueItems: AlertItem[] = alerts.overdueAccounts.map((a) => ({
        key: a.customerId,
        label: a.customerName,
        sublabel: `${rupees(a.outstandingAmount)} outstanding`,
        status: `${a.daysOverdue}d overdue`,
        tone: a.daysOverdue > 30 ? 'danger' : 'warning',
        href: '/dashboard/credit',
    }));

    return (
        <section aria-label="Needs attention" className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AlertCard
                title="Low stock"
                count={lowCount}
                summary={`${plural(lowCount, 'product is', 'products are')} below the reorder level`}
                icon={PackageX}
                items={lowItems}
                allClear="Every product is above its reorder level"
                viewAllLabel="See all low stock"
                viewAllHref="/dashboard/inventory?tab=low_stock"
            />
            <AlertCard
                title="Expiring stock"
                count={expCount}
                summary={`${plural(expCount, 'batch expires', 'batches expire')} within 90 days or ${expCount === 1 ? 'has' : 'have'} expired`}
                icon={AlertTriangle}
                items={expiringItems}
                allClear="Nothing expires within 90 days"
                viewAllLabel="See all expiring"
                viewAllHref="/dashboard/inventory?tab=expiring"
            />
            <AlertCard
                title="Overdue credit"
                count={overdueCount}
                summary={`${rupees(overdueAmount)} owed by ${plural(overdueCount, 'customer', 'customers')}`}
                icon={BadgeAlert}
                items={overdueItems}
                allClear="No overdue credit balances"
                viewAllLabel="Collect payments"
                viewAllHref="/dashboard/credit"
            />
        </section>
    );
}
