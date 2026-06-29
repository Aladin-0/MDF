'use client';

import React from 'react';
import { useProductBatches } from '@/hooks/useInventory';
import { 
    Drawer, DrawerContent, DrawerClose 
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, Plus, X, Package, AlertTriangle, TrendingUp, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { useRouter } from 'next/navigation';

export function BatchDetailDrawer({ productId, product, isOpen, onClose, onAdjust }: any) {
    const router = useRouter();
    const { data: batches, isLoading } = useProductBatches(productId);
    const data = batches || [];

    // Derive product details and aggregates from the batches array
    const { productInfo, totalStrips, averageMrp } = React.useMemo(() => {
        if (!data || data.length === 0) return { productInfo: product || null, totalStrips: 0, averageMrp: 0 };
        
        // Grab product details from the passed product prop, or the first batch
        const firstBatch = data[0];
        const info = product || (firstBatch ? firstBatch.product : {});
        
        const total = data.reduce((sum: number, b: any) => sum + (Number(b.qtyStrips) || 0), 0);
        
        // Calculate average MRP for active stock
        const totalValue = data.reduce((sum: number, b: any) => sum + ((Number(b.mrp) || 0) * (Number(b.qtyStrips) || 0)), 0);
        const avg = total > 0 ? (totalValue / total) : 0;

        return { productInfo: info, totalStrips: total, averageMrp: avg };
    }, [data, product]);

    return (
        <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && onClose()} direction="right">
            <DrawerContent className="h-full w-full sm:w-[95vw] lg:w-[1200px] border-l rounded-none p-0 overflow-y-auto bg-slate-50/30">
                
                {/* Fixed Header with Close Button */}
                <div className="sticky top-0 z-20 bg-white border-b px-10 py-8 flex justify-between items-start shadow-sm">
                    {isLoading ? (
                        <div className="space-y-3 w-full">
                            <Skeleton className="h-10 w-3/4" />
                            <Skeleton className="h-6 w-1/2" />
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center gap-4">
                                <div className="bg-primary/10 p-3 rounded-xl">
                                    <Layers className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                                    {productInfo?.name || 'Unknown Product'}
                                </h2>
                            </div>
                            <p className="text-xl text-slate-500 font-medium mt-3 ml-14">
                                {productInfo?.manufacturer || 'Unknown Manufacturer'}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-5 ml-14">
                                {productInfo?.scheduleType && productInfo.scheduleType !== 'OTC' && (
                                    <span className="px-4 py-2 bg-red-100 text-red-700 text-sm font-bold rounded-lg border border-red-200">
                                        Schedule {productInfo.scheduleType}
                                    </span>
                                )}
                                {productInfo?.drugType && (
                                    <span className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg border border-blue-200">
                                        {productInfo.drugType.charAt(0).toUpperCase() + productInfo.drugType.slice(1)}
                                    </span>
                                )}
                                {productInfo?.packSize && (
                                    <span className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg border border-slate-200">
                                        1 {productInfo.packType || 'Strip'} = {productInfo.packSize} {productInfo.packUnit || 'units'}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    <DrawerClose asChild>
                        <Button variant="ghost" size="icon" className="hover:bg-slate-100 h-12 w-12 rounded-full bg-white border shadow-sm">
                            <X className="w-6 h-6 text-slate-500" />
                        </Button>
                    </DrawerClose>
                </div>

                <div className="p-10 space-y-12">
                    
                    {/* SECTION 1: Stock Summary Metrics */}
                    {!isLoading && (
                        <div className="grid grid-cols-3 gap-8">
                            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
                                <Package className="w-10 h-10 text-indigo-500 mb-4" />
                                <span className="text-6xl font-black text-slate-900 tracking-tight">{totalStrips}</span>
                                <span className="text-base text-slate-500 font-bold mt-3 uppercase tracking-widest">Total Strips Left</span>
                            </div>
                            <div className={`bg-white border rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow ${totalStrips < (productInfo?.minQty || 10) ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}>
                                <AlertTriangle className={`w-10 h-10 mb-4 ${totalStrips < (productInfo?.minQty || 10) ? 'text-red-500' : 'text-slate-400'}`} />
                                <span className={`text-5xl font-black tracking-tight ${totalStrips < (productInfo?.minQty || 10) ? 'text-red-700' : 'text-slate-900'}`}>
                                    {productInfo?.minQty || 10}
                                </span>
                                <span className="text-base text-slate-500 font-bold mt-3 uppercase tracking-widest">Reorder Level</span>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
                                <TrendingUp className="w-10 h-10 text-emerald-500 mb-4" />
                                <span className="text-5xl font-black text-slate-900 tracking-tight mt-2">{formatCurrency(averageMrp)}</span>
                                <span className="text-base text-slate-500 font-bold mt-3 uppercase tracking-widest">Average MRP</span>
                            </div>
                        </div>
                    )}

                    {/* SECTION 2: Batches List */}
                    <div>
                        <div className="flex justify-between items-end mb-8">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-wide flex items-center gap-3">
                                <Layers className="w-7 h-7 text-primary" />
                                Current Inventory Batches
                            </h3>
                            <span className="text-base font-bold text-slate-600 bg-slate-200 px-4 py-2 rounded-lg shadow-sm">Sorted by First-Expiry-First-Out</span>
                        </div>

                        {isLoading ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {Array(4).fill(null).map((_, i) => (
                                    <Skeleton key={i} className="h-64 w-full rounded-3xl" />
                                ))}
                            </div>
                        ) : data.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {data.map((batch: any) => {
                                    const exDate = new Date(batch.expiryDate);
                                    const now = new Date();
                                    const diffDays = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                                    
                                    let borderColor = "border-slate-200";
                                    let badgeColor = "text-slate-700 bg-slate-100 border-slate-200";
                                    
                                    if (diffDays <= 0) {
                                        borderColor = "border-red-400 bg-red-50 shadow-red-100";
                                        badgeColor = "bg-red-600 text-white border-red-700";
                                    } else if (diffDays <= 90) {
                                        borderColor = "border-amber-400 bg-amber-50 shadow-amber-100";
                                        badgeColor = "bg-amber-100 text-amber-800 border-amber-300";
                                    }

                                    return (
                                        <div key={batch.id} className={`rounded-3xl p-8 border-2 ${borderColor} relative overflow-hidden transition-all shadow-sm hover:shadow-xl bg-white flex flex-col justify-between h-full`}>
                                            {diffDays <= 0 && (
                                                <div className="absolute top-6 -right-12 w-48 bg-red-600 text-white text-xs font-black py-2.5 text-center rotate-45 transform uppercase tracking-widest shadow-md">
                                                    Expired
                                                </div>
                                            )}
                                            
                                            <div>
                                                <div className="flex justify-between items-start mb-8">
                                                    <div>
                                                        <div className="text-sm uppercase text-slate-500 font-black tracking-widest mb-2">Batch Number</div>
                                                        <div className="font-mono font-black text-3xl text-slate-900 tracking-tight">{batch.batchNo}</div>
                                                        {batch.rackLocation && (
                                                            <div className="mt-2 text-sm font-bold text-slate-500 bg-slate-100 inline-block px-3 py-1 rounded-md">
                                                                Rack: {batch.rackLocation}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className={`text-base font-black px-4 py-2 rounded-xl border-2 ${badgeColor}`}>
                                                        Exp: {exDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-5 mb-8">
                                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                                        <div className="text-xs uppercase text-slate-500 font-black tracking-widest mb-2">Stock Left</div>
                                                        <div className="font-black text-slate-900 text-3xl">
                                                            {batch.qtyStrips} <span className="text-base font-bold text-slate-500">strips</span>
                                                            {batch.qtyLoose > 0 && <span className="text-base font-bold text-slate-500 ml-1">+ {batch.qtyLoose} loose</span>}
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                                        <div className="text-xs uppercase text-slate-500 font-black tracking-widest mb-2">Sale Rate</div>
                                                        <div className="font-black text-slate-900 text-2xl mt-1">{formatCurrency(batch.saleRate)}</div>
                                                    </div>
                                                    
                                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                                        <div className="text-xs uppercase text-slate-500 font-black tracking-widest mb-2">MRP</div>
                                                        <div className="font-black text-slate-700 text-xl">{formatCurrency(batch.mrp)}</div>
                                                    </div>

                                                    <PermissionGate permission="view_purchase_rates">
                                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                                            <div className="text-xs uppercase text-slate-500 font-black tracking-widest mb-2">Purchase Rate</div>
                                                            <div className="font-black text-slate-700 text-xl">{formatCurrency(batch.purchaseRate)}</div>
                                                        </div>
                                                    </PermissionGate>
                                                </div>
                                            </div>

                                            <div className="flex justify-end mt-auto pt-4">
                                                <Button variant="outline" size="lg" className="w-full text-lg h-14 font-black hover:bg-slate-100 border-2" onClick={() => onAdjust(batch)}>
                                                    <SlidersHorizontal className="w-6 h-6 mr-3 text-slate-500" /> Adjust Stock Balance
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center bg-white border-2 border-dashed border-slate-200 rounded-3xl py-16 shadow-sm">
                                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-700">No active batches</h3>
                                <p className="text-sm font-medium text-slate-500 mt-2">There is currently no stock available for this product.</p>
                            </div>
                        )}
                        
                        <PermissionGate permission="create_purchases">
                            <Button 
                                variant="outline" 
                                size="lg"
                                className="w-full mt-6 border-dashed border-2 py-8 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/60 transition-colors text-lg font-bold rounded-2xl"
                                onClick={() => router.push(`/dashboard/purchases/new?productId=${productId}`)}
                            >
                                <Plus className="w-6 h-6 mr-3" />
                                Receive New Stock for this Medicine
                            </Button>
                        </PermissionGate>
                    </div>

                </div>
            </DrawerContent>
        </Drawer>
    );
}