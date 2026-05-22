'use client';

import { Package, IndianRupee, AlertTriangle, PackageX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, inventoryApi } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';
import { useOutletId } from '@/hooks/useOutletId';

export function InventoryStatCards({ onTabChange }: { onTabChange?: (tab: string) => void }) {
    const outletId = useOutletId();

    // Total products count (paginated, just need totalRecords)
    const { data: stockData, isLoading: stockLoading } = useQuery({
        queryKey: ['inventory', 'stock-summary', outletId],
        queryFn: () => inventoryApi.getStock(outletId, { pageSize: 1 }),  // minimal — only need totalRecords
        staleTime: 1000 * 60 * 3,
        enabled: !!outletId,
    });

    // Real stock value across ALL batches (not paginated)
    const { data: valuationData, isLoading: valuationLoading } = useQuery({
        queryKey: ['inventory', 'valuation', outletId],
        queryFn: () => reportsApi.getStockValuation(outletId),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });

    // Expiring soon count (all pages)
    const { data: expiringData, isLoading: expiringLoading } = useQuery({
        queryKey: ['inventory', 'expiring-summary', outletId],
        queryFn: () => inventoryApi.getStock(outletId, { expiringSoon: true, pageSize: 1 }),
        staleTime: 1000 * 60 * 5,
        enabled: !!outletId,
    });

    // Low stock count (all pages)
    const { data: lowStockData, isLoading: lowStockLoading } = useQuery({
        queryKey: ['inventory', 'lowstock-summary', outletId],
        queryFn: () => inventoryApi.getStock(outletId, { lowStock: true, pageSize: 1 }),
        staleTime: 1000 * 60 * 3,
        enabled: !!outletId,
    });

    const isLoading = stockLoading || valuationLoading || expiringLoading || lowStockLoading;

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    const totalProducts   = stockData?.pagination?.totalRecords ?? stockData?.data?.length ?? 0;
    const stockValue      = valuationData?.data?.totalValuation ?? 0;
    const activeBatches   = valuationData?.data?.products?.reduce((sum: number, p: any) => sum + (p.batches?.length ?? 0), 0) ?? 0;
    const expiringCount   = expiringData?.pagination?.totalRecords ?? 0;
    const lowStockCount   = lowStockData?.pagination?.totalRecords ?? 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
                icon={<Package className="text-blue-600 w-5 h-5" />}
                bg="bg-blue-100"
                title="Total Products"
                value={`${totalProducts} products`}
                subtitle={`${activeBatches} active batches`}
            />
            <StatCard
                icon={<IndianRupee className="text-green-600 w-5 h-5" />}
                bg="bg-green-100"
                title="Stock Value"
                value={formatCurrency(stockValue)}
                subtitle="At purchase price"
            />
            <StatCard
                icon={<AlertTriangle className="text-amber-600 w-5 h-5" />}
                bg="bg-amber-100"
                title="Expiring Soon"
                value={`${expiringCount} batches`}
                subtitle="Within 90 days"
                onClick={() => onTabChange?.('expiring')}
                cursor="cursor-pointer hover:bg-slate-50 transition-colors"
            />
            <StatCard
                icon={<PackageX className="text-red-600 w-5 h-5" />}
                bg="bg-red-100"
                title="Low Stock"
                value={`${lowStockCount} items`}
                subtitle="Below reorder level"
                onClick={() => onTabChange?.('low_stock')}
                cursor="cursor-pointer hover:bg-slate-50 transition-colors"
            />
        </div>
    );
}

function StatCard({ icon, bg, title, value, subtitle, onClick, cursor }: any) {
    return (
        <Card className={cursor} onClick={onClick}>
            <CardContent className="p-6">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full flex items-center justify-center h-12 w-12 ${bg}`}>
                        {icon}
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">{title}</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
                        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
