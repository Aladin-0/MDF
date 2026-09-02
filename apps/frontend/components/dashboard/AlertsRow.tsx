'use client';

import { PackageX, PackageCheck, AlertTriangle, BadgeAlert } from 'lucide-react';
import { AlertCard, AlertItem } from './AlertCard';
import { DashboardAlerts } from '@/types';
import { formatCurrency } from '@/lib/gst';

interface AlertsRowProps {
  alerts?: DashboardAlerts;
  isLoading?: boolean;
}

export default function AlertsRow({ alerts, isLoading }: AlertsRowProps) {
  // If no data yet and not loading, we can safely assume early hydration or empty shell
  if (!alerts && !isLoading) return null;

  // Render placeholders for loading
  if (isLoading || !alerts) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AlertCard title="..." count={0} description="..." borderColor="border-slate-200" icon={PackageX} iconColor="text-slate-400" ctaLabel="..." ctaHref="#" isEmpty={false} emptyMessage="..." isLoading />
        <AlertCard title="..." count={0} description="..." borderColor="border-slate-200" icon={AlertTriangle} iconColor="text-slate-400" ctaLabel="..." ctaHref="#" isEmpty={false} emptyMessage="..." isLoading />
        <AlertCard title="..." count={0} description="..." borderColor="border-slate-200" icon={BadgeAlert} iconColor="text-slate-400" ctaLabel="..." ctaHref="#" isEmpty={false} emptyMessage="..." isLoading />
      </div>
    );
  }

  // --- Map Low Stock Alerts ---
  const lowStockAlerts = alerts?.lowStock || [];
  const lowStockCount = lowStockAlerts.length;
  const lowStockItems: AlertItem[] = lowStockAlerts.map((item) => ({
    label: item.batch.productName,
    sublabel: `Current: ${item.currentStock} | Reorder: ${item.reorderLevel}`,
    badge: (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">
        Restock
      </span>
    ),
  }));

  // --- Map Expiry Alerts ---
  const expiringSoonAlerts = alerts?.expiringSoon || [];
  const expiryCount = expiringSoonAlerts.length;
  const expiryItems: AlertItem[] = expiringSoonAlerts.map((item) => {
    const daysLeft = item.daysUntilExpiry;
    let badgeColor = 'bg-yellow-100 text-yellow-700'; // 60-90
    if (daysLeft <= 30) badgeColor = 'bg-red-100 text-red-700';
    else if (daysLeft <= 60) badgeColor = 'bg-amber-100 text-amber-700';

    return {
      label: item.batch.productName,
      sublabel: `Batch: ${item.batch.batchNumber} | Expires: ${item.batch.expiryDate}`,
      badge: (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${badgeColor}`}>
          in {daysLeft} days
        </span>
      ),
    };
  });

  // --- Map Overdue Credit Alerts ---
  const overdueAccountsAlerts = alerts?.overdueAccounts || [];
  const overdueCount = overdueAccountsAlerts.length;
  const overdueSum = overdueAccountsAlerts.reduce((acc, curr) => acc + curr.outstandingAmount, 0);
  const overdueItems: AlertItem[] = overdueAccountsAlerts.map((account) => ({
    label: account.customerName,
    sublabel: `${formatCurrency(account.outstandingAmount)} outstanding`,
    badge: (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 outline outline-1 outline-orange-200 cursor-pointer hover:bg-orange-200 transition-colors">
        {account.daysOverdue}d overdue
      </span>
    ),
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      
      {/* 1. Low Stock Alert */}
      <AlertCard
        title="Low Stock Alert"
        count={lowStockCount}
        description="{count} items below reorder level"
        borderColor={lowStockCount === 0 ? 'border-green-500' : 'border-amber-500'}
        icon={lowStockCount === 0 ? PackageCheck : PackageX}
        iconColor={lowStockCount === 0 ? 'text-green-500' : 'text-amber-500'}
        items={lowStockItems}
        isEmpty={lowStockCount === 0}
        emptyMessage="All stock levels normal"
        ctaLabel="View Inventory"
        ctaHref="/dashboard/inventory"
      />

      {/* 2. Expiry Alert */}
      <AlertCard
        title="Expiring Soon"
        count={expiryCount}
        description="{count} batches expire within 90 days"
        borderColor={expiryCount === 0 ? 'border-green-500' : 'border-red-500'}
        icon={AlertTriangle}
        iconColor={expiryCount === 0 ? 'text-green-500' : 'text-red-500'}
        items={expiryItems}
        isEmpty={expiryCount === 0}
        emptyMessage="No batches expiring soon"
        ctaLabel="View Expiry Report"
        ctaHref="/dashboard/reports"
      />

      {/* 3. Overdue Credit Alert */}
      <AlertCard
        title="Overdue Credit"
        count={overdueCount}
        description={`{count} customers | ${formatCurrency(overdueSum)}`}
        borderColor={overdueCount === 0 ? 'border-green-500' : 'border-orange-500'}
        icon={BadgeAlert}
        iconColor={overdueCount === 0 ? 'text-green-500' : 'text-orange-500'}
        items={overdueItems}
        isEmpty={overdueCount === 0}
        emptyMessage="No overdue credit balances"
        ctaLabel="Collect Now"
        ctaHref="/dashboard/credit"
      />

    </div>
  );
}
