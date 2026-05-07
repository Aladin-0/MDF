'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletId } from '@/hooks/useOutletId';
import { inventoryApi } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/gst';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { StockAdjustmentModal } from '@/components/inventory/StockAdjustmentModal';
import {
    ArrowLeft,
    Package,
    AlertTriangle,
    TrendingUp,
    Layers,
    Plus,
    SlidersHorizontal,
    Thermometer,
    Calendar,
    Hash,
    Pill,
    MapPin,
    CheckCircle2,
    XCircle,
    RefreshCw,
    DollarSign,
    BarChart3,
    Clock,
} from 'lucide-react';
import { Batch } from '@/types';

function InfoBadge({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</span>
            <span className="text-sm font-semibold text-slate-800">{value}</span>
        </div>
    );
}

function StatCard({ icon: Icon, value, label, color, highlight }: { icon: any; value: React.ReactNode; label: string; color: string; highlight?: boolean }) {
    return (
        <div className={`rounded-2xl p-6 flex flex-col items-center justify-center text-center border-2 transition-all shadow-sm hover:shadow-lg ${highlight ? 'border-red-300 bg-red-50' : 'border-slate-100 bg-white'}`}>
            <Icon className={`w-8 h-8 mb-3 ${color}`} />
            <div className={`text-4xl font-black tracking-tight ${highlight ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mt-2">{label}</div>
        </div>
    );
}

export default function ProductInventoryPage() {
    const { productId } = useParams<{ productId: string }>();
    const router = useRouter();
    const outletId = useOutletId();
    const queryClient = useQueryClient();
    const [adjustBatch, setAdjustBatch] = useState<Batch | null>(null);

    // Fetch product + batches from inventory endpoint
    const { data: stockList, isLoading } = useQuery({
        queryKey: ['inventory', 'stock', outletId, { search: productId }],
        queryFn: () => inventoryApi.getStock(outletId, { pageSize: 200 }),
        enabled: !!outletId,
    });

    // Find the matching product by productId
    const product = React.useMemo(() => {
        if (!stockList?.data) return null;
        return stockList.data.find((p: any) => p.id === productId) || null;
    }, [stockList, productId]);

    const batches: any[] = product?.batches || [];

    // Derived Metrics
    const metrics = React.useMemo(() => {
        if (!product) return null;
        const totalStrips = batches.reduce((s: number, b: any) => s + (Number(b.qtyStrips) || 0), 0);
        const totalLoose = batches.reduce((s: number, b: any) => s + (Number(b.qtyLoose) || 0), 0);
        const activeBatches = batches.filter((b: any) => new Date(b.expiryDate) > new Date());
        const expiredBatches = batches.filter((b: any) => new Date(b.expiryDate) <= new Date());
        const expiringSoon = batches.filter((b: any) => {
            const d = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
            return d > 0 && d <= 90;
        });

        const totalCostValue = batches.reduce((s: number, b: any) => s + ((Number(b.purchaseRate) || 0) * (Number(b.qtyStrips) || 0)), 0);
        const totalMrpValue = batches.reduce((s: number, b: any) => s + ((Number(b.mrp) || 0) * (Number(b.qtyStrips) || 0)), 0);
        const weightedMrp = totalStrips > 0 ? (totalMrpValue / totalStrips) : 0;
        const nearestExpiry = activeBatches.length > 0
            ? activeBatches.sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0].expiryDate
            : null;

        return { totalStrips, totalLoose, activeBatches: activeBatches.length, expiredBatches: expiredBatches.length, expiringSoon: expiringSoon.length, totalCostValue, totalMrpValue, weightedMrp, nearestExpiry };
    }, [product, batches]);

    const isLowStock = metrics && product && metrics.totalStrips < (product.minQty ?? 10);

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-10 w-64" />
                <div className="grid grid-cols-4 gap-6">
                    {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
                </div>
                <div className="grid grid-cols-3 gap-6">
                    {Array(3).fill(null).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <Package className="w-20 h-20 text-slate-200 mb-6" />
                <h2 className="text-2xl font-black text-slate-700">Product Not Found</h2>
                <p className="text-slate-400 mt-2 mb-6">This product doesn't exist or was removed.</p>
                <Button onClick={() => router.push('/dashboard/inventory')}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Inventory
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-16">

            {/* ─── PAGE HEADER ─────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <Button variant="outline" size="icon" className="rounded-xl border-2 h-11 w-11 mt-1" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{product.name}</h1>
                            {product.scheduleType && product.scheduleType !== 'OTC' && (
                                <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-bold rounded-lg border border-red-200">Schedule {product.scheduleType}</span>
                            )}
                            {product.isFridge && (
                                <span className="px-3 py-1 bg-sky-100 text-sky-700 text-sm font-bold rounded-lg border border-sky-200 flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5" />Cold Chain</span>
                            )}
                            {isLowStock && (
                                <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm font-bold rounded-lg border border-amber-200 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Low Stock</span>
                            )}
                        </div>
                        <p className="text-base text-slate-500 font-medium mt-1">{product.manufacturer}</p>
                        {product.composition && (
                            <p className="text-sm text-slate-400 mt-0.5 italic">{product.composition}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <Button
                        variant="outline"
                        className="border-2 font-bold"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['inventory', 'stock', outletId] })}
                    >
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                    <PermissionGate permission="create_purchases">
                        <Button
                            className="font-bold"
                            onClick={() => router.push(`/dashboard/purchases/new?productId=${productId}`)}
                        >
                            <Plus className="w-4 h-4 mr-2" /> Receive New Stock
                        </Button>
                    </PermissionGate>
                </div>
            </div>

            {/* ─── PRODUCT META INFO ───────────────────────────── */}
            <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-6 shadow-sm">
                <InfoBadge label="Drug Type" value={product.drugType ? product.drugType.charAt(0).toUpperCase() + product.drugType.slice(1) : '—'} />
                <InfoBadge label="Pack Size" value={product.packSize ? `${product.packSize} ${product.packUnit || 'units'}/${product.packType || 'strip'}` : '—'} />
                <InfoBadge label="HSN Code" value={product.hsnCode || '—'} />
                <InfoBadge label="GST Rate" value={product.gstRate != null ? `${product.gstRate}%` : '—'} />
                <InfoBadge label="Default MRP" value={formatCurrency(product.mrp)} />
                <InfoBadge label="Default Sale Rate" value={formatCurrency(product.saleRate)} />
                <InfoBadge label="Min Reorder Qty" value={`${product.minQty ?? 10} strips`} />
            </div>

            {/* ─── KPI CARDS ───────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-6">
                <StatCard icon={Package} value={metrics?.totalStrips ?? 0} label="Total Strips In Stock" color="text-indigo-500" highlight={!!isLowStock} />
                <StatCard icon={Layers} value={metrics?.activeBatches ?? 0} label="Active Batches" color="text-emerald-500" />
                <StatCard icon={AlertTriangle} value={metrics?.expiringSoon ?? 0} label="Expiring ≤ 90 Days" color="text-amber-500" />
                <StatCard icon={BarChart3} value={formatCurrency(metrics?.totalMrpValue ?? 0)} label="Total MRP Value" color="text-primary" />
            </div>

            {/* ─── SECONDARY METRICS ROW ───────────────────────── */}
            <PermissionGate permission="view_purchase_rates">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Total Cost Value</div>
                        <div className="text-2xl font-black text-slate-900">{formatCurrency(metrics?.totalCostValue ?? 0)}</div>
                        <div className="text-xs text-slate-400 mt-1">at purchase rate</div>
                    </div>
                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Weighted Avg. MRP</div>
                        <div className="text-2xl font-black text-slate-900">{formatCurrency(metrics?.weightedMrp ?? 0)}</div>
                        <div className="text-xs text-slate-400 mt-1">across all batches</div>
                    </div>
                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Nearest Expiry</div>
                        <div className="text-2xl font-black text-slate-900">
                            {metrics?.nearestExpiry
                                ? new Date(metrics.nearestExpiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">earliest active batch</div>
                    </div>
                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Loose Units</div>
                        <div className="text-2xl font-black text-slate-900">{metrics?.totalLoose ?? 0}</div>
                        <div className="text-xs text-slate-400 mt-1">below full strip level</div>
                    </div>
                </div>
            </PermissionGate>

            {/* ─── BATCH TABLE ─────────────────────────────────── */}
            <div>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                        <Layers className="w-6 h-6 text-primary" />
                        Batch-Wise Inventory
                    </h2>
                    <span className="text-sm font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200">
                        FEFO — First Expiry, First Out
                    </span>
                </div>

                {batches.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-20 text-center shadow-sm">
                        <Package className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-xl font-black text-slate-600">No Batches Found</h3>
                        <p className="text-slate-400 text-sm mt-2 mb-6">No stock has been received for this product yet.</p>
                        <PermissionGate permission="create_purchases">
                            <Button onClick={() => router.push(`/dashboard/purchases/new?productId=${productId}`)}>
                                <Plus className="w-4 h-4 mr-2" /> Receive First Stock
                            </Button>
                        </PermissionGate>
                    </div>
                ) : (
                    <div className="bg-white border-2 border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b-2 border-slate-100">
                                    <th className="text-left py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Batch No.</th>
                                    <th className="text-left py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Expiry</th>
                                    <th className="text-left py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Mfg Date</th>
                                    <th className="text-right py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Strips Left</th>
                                    <th className="text-right py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Loose Units</th>
                                    <th className="text-right py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">MRP</th>
                                    <th className="text-right py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Sale Rate</th>
                                    <PermissionGate permission="view_purchase_rates">
                                        <th className="text-right py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Purchase Rate</th>
                                        <th className="text-right py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Stock Value</th>
                                    </PermissionGate>
                                    <th className="text-center py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Rack</th>
                                    <th className="text-center py-4 px-6 font-black text-xs uppercase tracking-widest text-slate-400">Status</th>
                                    <th className="py-4 px-6"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {batches.map((batch: any, idx: number) => {
                                    const exDate = new Date(batch.expiryDate);
                                    const now = new Date();
                                    const diffDays = Math.ceil((exDate.getTime() - now.getTime()) / 86400000);
                                    const isExpired = diffDays <= 0;
                                    const isExpiringSoon = diffDays > 0 && diffDays <= 90;
                                    const stockValue = (Number(batch.purchaseRate) || 0) * (Number(batch.qtyStrips) || 0);

                                    let rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                                    if (isExpired) rowBg = 'bg-red-50/70';
                                    else if (isExpiringSoon) rowBg = 'bg-amber-50/50';

                                    return (
                                        <tr key={batch.id} className={`${rowBg} hover:bg-slate-100/80 transition-colors`}>
                                            <td className="py-4 px-6">
                                                <span className="font-mono font-black text-slate-900 text-base">{batch.batchNo}</span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`font-bold text-sm ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-700' : 'text-slate-700'}`}>
                                                    {exDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                                {!isExpired && (
                                                    <div className="text-xs text-slate-400 mt-0.5">{diffDays}d remaining</div>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-slate-500 text-sm">
                                                {batch.mfgDate
                                                    ? new Date(batch.mfgDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <span className="text-2xl font-black text-slate-900">{batch.qtyStrips}</span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <span className="font-bold text-slate-600">{batch.qtyLoose || 0}</span>
                                            </td>
                                            <td className="py-4 px-6 text-right font-bold text-slate-700">{formatCurrency(batch.mrp)}</td>
                                            <td className="py-4 px-6 text-right font-bold text-slate-700">{formatCurrency(batch.saleRate)}</td>
                                            <PermissionGate permission="view_purchase_rates">
                                                <td className="py-4 px-6 text-right font-bold text-slate-700">{formatCurrency(batch.purchaseRate)}</td>
                                                <td className="py-4 px-6 text-right font-bold text-emerald-700">{formatCurrency(stockValue)}</td>
                                            </PermissionGate>
                                            <td className="py-4 px-6 text-center text-slate-500 text-sm">
                                                {batch.rackLocation
                                                    ? <span className="font-bold bg-slate-100 px-2 py-1 rounded text-slate-700">{batch.rackLocation}</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                {isExpired ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-black rounded-lg border border-red-200">
                                                        <XCircle className="w-3.5 h-3.5" /> Expired
                                                    </span>
                                                ) : isExpiringSoon ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-black rounded-lg border border-amber-200">
                                                        <Clock className="w-3.5 h-3.5" /> Expiring Soon
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-lg border border-emerald-200">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="border-2 font-bold text-xs h-9 px-4"
                                                    onClick={() => setAdjustBatch(batch as Batch)}
                                                >
                                                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" /> Adjust
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {/* TOTALS ROW */}
                            <tfoot>
                                <tr className="bg-slate-100 border-t-2 border-slate-200">
                                    <td colSpan={3} className="py-4 px-6 font-black text-sm uppercase tracking-widest text-slate-600">Totals</td>
                                    <td className="py-4 px-6 text-right font-black text-slate-900 text-xl">{metrics?.totalStrips ?? 0}</td>
                                    <td className="py-4 px-6 text-right font-black text-slate-700">{metrics?.totalLoose ?? 0}</td>
                                    <td colSpan={2} className="py-4 px-6"></td>
                                    <PermissionGate permission="view_purchase_rates">
                                        <td className="py-4 px-6"></td>
                                        <td className="py-4 px-6 text-right font-black text-emerald-700">{formatCurrency(metrics?.totalCostValue ?? 0)}</td>
                                    </PermissionGate>
                                    <td colSpan={3} className="py-4 px-6"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* ─── ADJUST MODAL ────────────────────────────────── */}
            <StockAdjustmentModal
                isOpen={!!adjustBatch}
                batch={adjustBatch}
                onClose={() => setAdjustBatch(null)}
                onSubmit={async (payload: any) => {
                    await inventoryApi.adjustStock(payload);
                    queryClient.invalidateQueries({ queryKey: ['inventory', 'stock', outletId] });
                    setAdjustBatch(null);
                }}
            />
        </div>
    );
}
