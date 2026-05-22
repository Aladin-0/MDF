'use client';

import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PackageX, ShoppingCart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export function LowStockTable({ onReorderClick }: any) {
    const outletId = useOutletId();

    // Fetch ALL low-stock products (large page size to avoid truncation at 50)
    const { data: raw, isLoading } = useQuery({
        queryKey: ['inventory', 'lowstock-table', outletId],
        queryFn: () => inventoryApi.getStock(outletId, { lowStock: true, pageSize: 500 }),
        staleTime: 1000 * 60 * 3,
        enabled: !!outletId,
    });

    const data: any[] = Array.isArray(raw) ? raw : (raw?.data || []);

    return (
        <div className="space-y-4">
            {/* Action Banner */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <PackageX className="w-5 h-5 text-red-500" />
                    <div>
                        <p className="font-semibold text-slate-800">{data.length} items below reorder level</p>
                        <p className="text-sm text-red-700">Place orders to avoid stockouts</p>
                    </div>
                </div>
                <div>
                    <Button onClick={onReorderClick}>Create Purchase Order</Button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border rounded-xl overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50 border-b">
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="w-48">Current Stock</TableHead>
                            <TableHead>Reorder Level</TableHead>
                            <TableHead>Shortage</TableHead>
                            <TableHead>Nearest Expiry</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array(5).fill(null).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={6}>
                                        <Skeleton className="h-8 w-full" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : data.length > 0 ? (
                            data.map((product: any) => {
                                // Use per-product reorder level from backend; fall back to 10
                                const reorderLevel = product.minQty ?? product.reorderQty ?? 10;
                                const qty = product.totalStock ?? 0;
                                const packType = product.packType ? `${product.packType}s` : 'units';
                                const shortage = Math.max(0, reorderLevel - qty);
                                const fillPct = reorderLevel > 0 ? Math.min(100, (qty / reorderLevel) * 100) : 0;

                                return (
                                    <TableRow key={product.id} className="hover:bg-slate-50 transition-colors">
                                        <TableCell>
                                            <div className="font-semibold text-slate-900 text-sm">{product.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">{product.composition}</div>
                                            <div className="text-xs text-slate-400">{product.manufacturer}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-xl font-bold text-red-600">{qty} {packType}</div>
                                            <Progress value={fillPct} className="h-1.5 mt-2 bg-slate-100" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-amber-600 font-medium">{reorderLevel} {packType}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-red-600 font-semibold">Need {shortage} more</div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-slate-600">
                                                {product.nearestExpiry && product.nearestExpiry !== '2099-12-31'
                                                    ? new Date(product.nearestExpiry).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                                                    : 'N/A'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" onClick={onReorderClick}>
                                                <ShoppingCart className="w-3 h-3 mr-2" />
                                                Order Now
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                    No low stock items found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
