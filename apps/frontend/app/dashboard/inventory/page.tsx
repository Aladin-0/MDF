'use client'

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, Download, Loader2, PackageX, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { EditProductModal } from '@/components/inventory/EditProductModal';
import { ExpiryTable } from '@/components/inventory/ExpiryTable';
import { InventoryStatCards } from '@/components/inventory/InventoryStatCards';
import { LowStockTable } from '@/components/inventory/LowStockTable';
import { StockAdjustmentModal } from '@/components/inventory/StockAdjustmentModal';
import { StockTable } from '@/components/inventory/StockTable';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { useInventorySummary } from '@/hooks/useInventorySummary';
import { useOutletId } from '@/hooks/useOutletId';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { downloadBatchDetail, downloadProductSummary } from '@/lib/inventoryApi';
import { TABS, type InventoryTab } from '@/lib/inventoryParams';
import type { Batch, MasterProduct, ProductSearchResult } from '@/types';

const count = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

interface AdjustTarget { batch: Batch; product: ProductSearchResult }

function InventoryView() {
    const router = useRouter();
    const outletId = useOutletId();
    const { toast } = useToast();
    const { params, update } = useInventoryFilters();
    const { counts } = useInventorySummary();

    const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
    const [editProduct, setEditProduct] = useState<MasterProduct | null>(null);
    const [exporting, setExporting] = useState<'summary' | 'batches' | null>(null);

    const runExport = async (kind: 'summary' | 'batches') => {
        if (!outletId) return;
        setExporting(kind);
        try {
            if (kind === 'summary') {
                await downloadProductSummary(outletId, { search: params.q, scheduleType: params.schedule, sortBy: params.sort, sortOrder: params.order });
            } else {
                await downloadBatchDetail(outletId, params.q);
            }
            toast({ title: 'Export ready', description: 'The Excel file has been downloaded.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: `${apiErrorMessage(e, 'The file could not be created.')} Try again in a moment.` });
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance]">Inventory</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Stock levels, batches and expiry dates</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 [&>*]:max-sm:flex-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" disabled={!!exporting}>
                                {exporting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download aria-hidden="true" />}
                                {exporting ? 'Exporting…' : 'Export'}
                                <ChevronDown className="opacity-60" aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => runExport('summary')}>Product Summary (Excel)</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => runExport('batches')}>Batch Detail (Excel)</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <PermissionGate permission="create_purchases">
                        <Button type="button" onClick={() => router.push('/dashboard/purchases')}>
                            <Plus aria-hidden="true" /> Add Stock (GRN)
                        </Button>
                    </PermissionGate>
                </div>
            </header>

            <InventoryStatCards onTabChange={(tab) => update({ tab })} />

            <Tabs value={params.tab} onValueChange={(v) => TABS.includes(v as InventoryTab) && update({ tab: v as InventoryTab })}>
                <TabsList className="h-auto flex-wrap">
                    <TabsTrigger value="all" className="gap-2">
                        All Stock
                        <Badge variant="secondary" className="tabular-nums">{count.format(counts.total)}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="expiring" className="gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                        Expiring Soon
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 tabular-nums text-amber-800">{count.format(counts.expiring)}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="low_stock" className="gap-2">
                        <PackageX className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                        Low Stock
                        <Badge variant="outline" className="border-red-300 bg-red-50 tabular-nums text-red-800">{count.format(counts.lowStock)}</Badge>
                    </TabsTrigger>
                </TabsList>

                <div className="mt-4">
                    <TabsContent value="all" className="mt-0">
                        <StockTable
                            onAdjustClick={(batch, product) => setAdjust({ batch, product })}
                            onEditClick={(product) => setEditProduct(product)}
                        />
                    </TabsContent>
                    <TabsContent value="expiring" className="mt-0">
                        <ExpiryTable onAdjustClick={(batch, product) => setAdjust({ batch, product })} />
                    </TabsContent>
                    <TabsContent value="low_stock" className="mt-0">
                        {/* opens the Purchase Orders tab with the New PO popup ready */}
                        <LowStockTable onReorderClick={() => router.push('/dashboard/purchases?tab=purchase_orders&newPo=1')} />
                    </TabsContent>
                </div>
            </Tabs>

            <StockAdjustmentModal
                isOpen={!!adjust}
                batch={adjust?.batch ?? null}
                batches={adjust?.product.batches}
                productName={adjust?.product.name}
                onClose={() => setAdjust(null)}
            />

            {/* mounted only while open: it used to load the distributor list on every visit, for a form nobody had opened */}
            {editProduct && (
                <EditProductModal
                    product={editProduct}
                    open
                    onOpenChange={(open) => { if (!open) setEditProduct(null); }}
                />
            )}
        </div>
    );
}

// useSearchParams() needs a Suspense boundary in the App Router.
export default function InventoryPage() {
    return (
        <Suspense fallback={<div className="space-y-6"><Skeleton className="h-9 w-48" /><Skeleton className="h-28 w-full" /><Skeleton className="h-96 w-full" /></div>}>
            <InventoryView />
        </Suspense>
    );
}
