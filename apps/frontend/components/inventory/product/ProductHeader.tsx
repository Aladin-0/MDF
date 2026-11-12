'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Pencil, Plus, RefreshCw, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { formatCurrency } from '@/lib/gst';
import { describePack } from '@/lib/productDetail';
import { pluralize } from '@/lib/inventory';
import { cn } from '@/lib/utils';

interface ProductHeaderProps {
    product: {
        name: string; manufacturer?: string; composition?: string; scheduleType?: string; isFridge?: boolean; drugType?: string;
        hsnCode?: string; gstRate?: number; mrp: number; packSize?: number; packType?: string; packUnit?: string;
    };
    isLow: boolean;
    level: number;
    refreshing: boolean;
    onRefresh: () => void;
    onEdit: () => void;
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('flex items-baseline gap-1.5', className)}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 font-medium">{children}</dd>
        </div>
    );
}

/** Title, status badges, actions and the product's key facts in two lines (it used to take about 330px, with the facts in a separate card). */
export function ProductHeader({ product, isLow, level, refreshing, onRefresh, onEdit }: ProductHeaderProps) {
    const router = useRouter();
    const scheduled = product.scheduleType && product.scheduleType !== 'OTC';

    return (
        <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {/* back to where you came from (keeps the list's filters), or the list when opened directly */}
                <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0">
                    <Link
                        href="/dashboard/inventory"
                        aria-label="Back to Inventory"
                        onClick={(e) => {
                            if (window.history.length > 1 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); router.back(); }
                        }}
                    >
                        <ArrowLeft aria-hidden="true" />
                    </Link>
                </Button>

                <h1 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-tight sm:text-2xl" title={product.name}>{product.name}</h1>

                <div className="flex flex-wrap items-center gap-1.5">
                    {scheduled && <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">Schedule {product.scheduleType}</span>}
                    {product.isFridge && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                            <Thermometer className="h-3 w-3" aria-hidden="true" /> Cold Chain
                        </span>
                    )}
                    {isLow && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Low Stock
                        </span>
                    )}
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                    <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                        <RefreshCw className={refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" /> Refresh
                    </Button>
                    <PermissionGate permission="edit_inventory">
                        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                            <Pencil aria-hidden="true" /> Edit Product
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="create_purchases">
                        {/* the purchases screen is where stock is received; /purchases/new does not exist (this link was a 404) */}
                        <Button asChild size="sm">
                            <Link href="/dashboard/purchases"><Plus aria-hidden="true" /> Receive Stock</Link>
                        </Button>
                    </PermissionGate>
                </div>
            </div>

            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {product.manufacturer && <Fact label="Maker">{product.manufacturer}</Fact>}
                {product.composition && <Fact label="Salt" className="max-w-full sm:max-w-[28rem]"><span className="block truncate" title={product.composition}>{product.composition}</span></Fact>}
                {product.drugType && <Fact label="Type"><span className="capitalize">{product.drugType}</span></Fact>}
                <Fact label="HSN"><span translate="no" className="tabular-nums">{product.hsnCode || '—'}</span></Fact>
                <Fact label="GST"><span className="tabular-nums">{product.gstRate != null ? `${product.gstRate}%` : '—'}</span></Fact>
                <Fact label="Pack">{describePack(product)}</Fact>
                <Fact label="Default MRP"><span className="tabular-nums">{formatCurrency(product.mrp)}</span></Fact>
                <Fact label="Reorder at"><span className="tabular-nums">{level} {pluralize(product.packType || 'pack', level)}</span></Fact>
            </dl>
        </header>
    );
}
