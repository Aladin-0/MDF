'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, PackageX, Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { StockAdjustmentModal } from '@/components/inventory/StockAdjustmentModal';
import { ProductHeader } from '@/components/inventory/product/ProductHeader';
import { ProductSummary } from '@/components/inventory/product/ProductSummary';
import { ProductBatchTable } from '@/components/inventory/product/ProductBatchTable';
import { EditBatchModal } from '@/components/inventory/product/EditBatchModal';
import { EditProductModal } from '@/components/inventory/EditProductModal';
import { useOutletId } from '@/hooks/useOutletId';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorMessage } from '@/lib/apiError';
import { inventoryApi } from '@/lib/apiClient';
import { computeMetrics, type DetailBatch } from '@/lib/productDetail';

export default function ProductInventoryPage() {
    const { productId } = useParams<{ productId: string }>();
    const outletId = useOutletId();
    const queryClient = useQueryClient();
    const { hasPermission } = usePermissions();
    const [adjustBatch, setAdjustBatch] = useState<DetailBatch | null>(null);
    const [editBatch, setEditBatch] = useState<DetailBatch | null>(null);
    const [editingProduct, setEditingProduct] = useState(false);

    // This product and its batches in one request (no pagination to hit).
    const { data: product, isLoading, isFetching, isError, error, refetch } = useQuery({
        queryKey: ['inventory', 'product', outletId, productId],
        queryFn: () => inventoryApi.getProductDetail(productId, outletId),
        enabled: !!outletId && !!productId,
    });

    const metrics = useMemo(() => (product ? computeMetrics(product) : null), [product]);

    // Everything under ['inventory', ...] refreshes together: this page, the list and its counts.
    // (Refresh used to invalidate ['inventory','stock'], which this page's own key does not start with: it did nothing.)
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['inventory'] });

    // The form sends only the fields that changed; the server writes only those, logs the change and refreshes what
    // billing and the lists show. Errors go back to the form, which shows them next to the field.
    const saveBatch = async (batchId: string, patch: Record<string, string | number | null>) => {
        const result = await inventoryApi.updateBatch(batchId, patch);
        await refresh();
        return result;
    };

    if (isLoading) {
        return (
            <div className="space-y-3" role="status" aria-label="Loading product">
                <Skeleton className="h-9 w-80" />
                <Skeleton className="h-5 w-full max-w-2xl" />
                <Skeleton className="h-[72px] w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    // a failed request is not "not found": say what happened and let them retry
    if (isError) {
        return (
            <div className="space-y-3">
                <Button asChild variant="outline" size="sm"><Link href="/dashboard/inventory"><ArrowLeft aria-hidden="true" /> Inventory</Link></Button>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Couldn&apos;t load this product</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>{apiErrorMessage(error, 'Something went wrong.')} Check your connection and try again.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Try Again</Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!product || !metrics) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center text-center">
                <PackageX className="mb-4 h-14 w-14 text-muted-foreground/40" aria-hidden="true" />
                <h1 className="text-xl font-semibold">Product Not Found</h1>
                <p className="mb-5 mt-1 text-sm text-muted-foreground">It has no stock at this outlet, or it was removed.</p>
                <Button asChild><Link href="/dashboard/inventory"><ArrowLeft aria-hidden="true" /> Back to Inventory</Link></Button>
            </div>
        );
    }

    const batches: DetailBatch[] = product.batches ?? [];

    return (
        <div className="space-y-3">
            <ProductHeader product={product} isLow={metrics.isLow} level={metrics.level} refreshing={isFetching} onRefresh={refresh} onEdit={() => setEditingProduct(true)} />

            <ProductSummary metrics={metrics} product={product} showCost={hasPermission('view_purchase_rates')} />

            {batches.length === 0 ? (
                <section aria-labelledby="batches-title" className="rounded-xl border border-dashed bg-card py-14 text-center">
                    <h2 id="batches-title" className="text-base font-semibold">No batches yet</h2>
                    <p className="mt-1 text-sm text-muted-foreground">No stock has been received for this product.</p>
                    <PermissionGate permission="create_purchases">
                        <Button asChild className="mt-4"><Link href="/dashboard/purchases"><Plus aria-hidden="true" /> Receive First Stock</Link></Button>
                    </PermissionGate>
                </section>
            ) : (
                <ProductBatchTable
                    product={{ ...product, batches }}
                    metrics={metrics}
                    onAdjust={setAdjustBatch}
                    onEdit={setEditBatch}
                    onSaveBatch={(id, patch) => inventoryApi.updateBatch(id, patch)}
                    onSaved={refresh}
                />
            )}

            <EditBatchModal
                batch={editBatch}
                productName={product.name}
                showRates={hasPermission('view_purchase_rates')}
                onSave={saveBatch}
                onClose={() => setEditBatch(null)}
            />

            {/* mounted only while open: it used to load the distributor list (13 KB) on every visit, for a form nobody had opened */}
            {editingProduct && <EditProductModal product={product as any} open onOpenChange={setEditingProduct} />}

            {/* the modal sends the adjustment itself and refreshes everything under ['inventory'] */}
            <StockAdjustmentModal
                isOpen={!!adjustBatch}
                batch={adjustBatch as any}
                batches={batches as any}
                productName={product.name}
                onClose={() => setAdjustBatch(null)}
            />
        </div>
    );
}
