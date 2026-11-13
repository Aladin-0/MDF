'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Ban, CalendarClock, CalendarX, PackageMinus, TrendingDown } from 'lucide-react';
import type { Batch, CartItem, ProductSearchResult } from '@/types';
import { useBillingStore } from '@/store/billingStore';
import { productsApi } from '@/lib/apiClient';
import { useOutletId } from '@/hooks/useOutletId';
import { calculateRowTotals, type RowTotals } from '@/lib/cartUtils';
import { calculateLineMargin } from '@/lib/billingMarginUtils';
import { allowsLoose, wholePackWord } from '@/lib/packRules';
import { getExpiryStatus, type ExpiryStatus } from '@/utils/expiry';
import { cn } from '@/lib/utils';
import { QtyStepper } from './QtyStepper';
import { T } from './theme';

type SaleType = 'RETAIL' | 'WHOLESALE';

/* ---------------------------------------------------------------------------------------------
 * Shared helpers (also used by LineEditorSheet so the card stepper and the editor compute a line the same way as the desktop row editor)
 * ------------------------------------------------------------------------------------------- */

/** The product's batches for this cart line (same query key as the desktop row editor, so the cache is shared). */
export function useLineBatches(item: CartItem) {
    const outletId = useOutletId();
    const { data, isFetching } = useQuery({
        queryKey: ['product', 'search', item.name, outletId],
        queryFn: () => (outletId ? productsApi.search(item.name, outletId, 'billing') : Promise.resolve([] as ProductSearchResult[])),
        enabled: !!outletId,
        staleTime: 60_000,
    });
    const product: ProductSearchResult | undefined = data?.find((p: ProductSearchResult) => p.id === item.productId);
    const batches: Batch[] = product?.batches ?? [];
    return { product, batches, isFetching };
}

/** A stand-in for the line's own batch while the real list has not loaded (same fallback the desktop editor uses). Stock unknown = unlimited. */
export function batchFromItem(item: CartItem): Batch {
    return {
        id: item.batchId,
        outletId: '',
        outletProductId: '',
        batchNo: item.batchNo,
        expiryDate: item.expiryDate,
        mrp: item.mrp,
        ptr: item.ptr,
        pts: item.pts,
        purchaseRate: item.purchaseRate || 0,
        landingRate: item.landingRate ?? item.purchaseRate ?? 0,
        saleRate: item.rate,
        qtyStrips: 1_000_000,
        qtyLoose: 0,
        packSize: item.packSize || 1,
        packUnit: item.packUnit || 'units',
        packType: item.packType || 'Strip',
        isActive: true,
        createdAt: '',
    };
}

export interface LineInputs {
    qtyStrips: number | string;
    qtyLoose: number | string;
    discountType: 'percentage' | 'amount';
    discountValue: string;
    freeQtyStrips?: number | string;
    freeQtyLoose?: number | string;
    /** Wholesale rate fields as typed ('' = not set) */
    ptr?: string;
    pts?: string;
}

/** The rate (before discount) a line is priced at: same rule as the desktop editor. */
export function lineBaseRate(item: CartItem, batch: Batch, saleType: SaleType, sameBatch: boolean, ptr?: string, pts?: string): number {
    const historical = sameBatch ? (item.saleRate || item.mrp) : undefined;
    if (saleType === 'WHOLESALE') {
        return parseFloat(pts || '') || parseFloat(ptr || '') || batch.pts || batch.ptr || batch.mrp;
    }
    return historical ?? batch.mrp;
}

/** Totals for a line with these inputs, using calculateRowTotals exactly as InlineRowEditor does. */
export function computeLine(item: CartItem, batch: Batch, inputs: LineInputs, saleType: SaleType, sameBatch = true) {
    const hasLoose = allowsLoose(batch);
    const looseRaw = hasLoose ? String(inputs.qtyLoose) : '0';
    const baseRate = lineBaseRate(item, batch, saleType, sameBatch, inputs.ptr, inputs.pts);
    const totals = calculateRowTotals(
        batch, String(inputs.qtyStrips), looseRaw, inputs.discountType, inputs.discountValue, item.gstRate, baseRate, saleType,
    );
    return { totals, baseRate, hasLoose };
}

/** The line's current discount as the text the editor starts with. */
export function itemDiscountValue(item: CartItem): string {
    return item.discountType === 'amount' ? String(item.discountAmount ?? 0) : String(item.discountPct ?? 0);
}

/** The cart fields that change when quantity or discount change (what InlineRowEditor writes on save, minus batch / rate-field changes). */
export function lineUpdatesFromTotals(totals: RowTotals, qtyStrips: number, qtyLoose: number, discountType: 'percentage' | 'amount'): Partial<CartItem> {
    return {
        qtyStrips,
        qtyLoose,
        totalQty: totals.tQtyFractional,
        discountPct: totals.dPct,
        discountType,
        discountAmount: discountType === 'amount' ? totals.dAmount : undefined,
        rate: totals.rate,
        totalAmount: totals.sellAmount,
        taxableAmount: totals.taxableAmount,
        gstAmount: totals.gstAmount,
    };
}

export function formatExpiry(expiryDate?: string | null): string {
    if (!expiryDate) return '—';
    if (expiryDate.includes('-') && expiryDate.length > 7 && !isNaN(new Date(expiryDate).getTime())) return format(new Date(expiryDate), 'MM/yy');
    return String(expiryDate);
}

/** "3 strips + 2 loose" / "5 bottles": a stock number the cashier can read. */
export function describeStock(units: number, packSize: number, loose: boolean, packType?: string | null): string {
    const size = packSize > 0 ? packSize : 1;
    const word = wholePackWord(packType);
    const packs = Math.floor(units / size);
    const rest = units % size;
    if (loose && rest > 0) return `${packs} ${word}${packs === 1 ? '' : 's'} + ${rest} loose`;
    return `${packs} ${word}${packs === 1 ? '' : 's'}`;
}

/** Label for the whole-pack quantity: "Strips" when loose is possible, else the pack word ("Bottles", "Units"). */
export function packQtyLabel(loose: boolean, packType?: string | null): string {
    if (loose) return 'Strips';
    const word = wholePackWord(packType);
    const cap = word.charAt(0).toUpperCase() + word.slice(1);
    return cap.endsWith('s') ? cap : `${cap}s`;
}

/* ---------------------------------------------------------------------------------------------
 * The card
 * ------------------------------------------------------------------------------------------- */

const BAR: Record<ExpiryStatus, string> = {
    expired: 'bg-red-500',
    expiring_soon: 'bg-amber-500',
    near_expiry: 'bg-yellow-400',
    good: 'bg-emerald-500',
    unknown: 'bg-slate-300',
};

const EXPIRY_TEXT: Record<ExpiryStatus, string> = {
    expired: 'text-red-800',
    expiring_soon: 'text-amber-800',
    near_expiry: 'text-yellow-800',
    good: 'text-slate-800',
    unknown: 'text-slate-800',
};

function Badge({ tone, icon, children, title }: { tone: 'red' | 'amber' | 'yellow'; icon: React.ReactNode; children: React.ReactNode; title?: string }) {
    const tones = {
        red: 'bg-red-100 text-red-900',
        amber: 'bg-amber-100 text-amber-900',
        yellow: 'bg-yellow-100 text-yellow-900',
    } as const;
    return (
        <span title={title} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-extrabold', tones[tone])}>
            {icon}
            {children}
        </span>
    );
}

export interface CartLineCardProps {
    item: CartItem;
    draftId: string;
    saleType: SaleType;
    /** Show the Landing / Profit line (caller decides: canViewBillingMargins AND showMarginInfo) */
    showMargin: boolean;
    extraDiscountPct?: number;
    landingCostIncludeGst?: boolean;
    /** Tapping the card (not the steppers) */
    onEdit: (batchId: string) => void;
}

export function CartLineCard({ item, showMargin, extraDiscountPct = 0, landingCostIncludeGst = false, saleType, onEdit }: CartLineCardProps) {
    const expiryStatus = getExpiryStatus(item.expiryDate);
    const margin = calculateLineMargin(item, extraDiscountPct, saleType, landingCostIncludeGst);
    const isLoss = margin.isLossSale;

    // What was added, in words. Changing it is done in the editor (tap the card): the bill card itself has no "add quantity" controls.
    const word = wholePackWord(item.packType);
    const qtyParts: string[] = [];
    if (item.qtyStrips > 0) qtyParts.push(`${item.qtyStrips} ${word}${item.qtyStrips === 1 ? '' : 's'}`);
    if (item.qtyLoose > 0) qtyParts.push(`${item.qtyLoose} loose`);
    const qtyText = qtyParts.join(' + ') || '0';

    const badges: React.ReactNode[] = [];
    if (item.batchAvailabilityStatus === 'BATCH_UNAVAILABLE') {
        badges.push(<Badge key="oos" tone="red" icon={<Ban className="h-3.5 w-3.5" aria-hidden />}>Out of stock</Badge>);
    }
    if (item.batchAvailabilityStatus === 'BATCH_EXPIRED' || expiryStatus === 'expired') {
        badges.push(<Badge key="exp" tone="red" icon={<CalendarX className="h-3.5 w-3.5" aria-hidden />}>Expired</Badge>);
    } else if (expiryStatus === 'expiring_soon') {
        badges.push(<Badge key="soon" tone="amber" icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}>Exp soon</Badge>);
    } else if (expiryStatus === 'near_expiry') {
        badges.push(<Badge key="near" tone="yellow" icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}>Near expiry</Badge>);
    }
    if (item.batchAvailabilityStatus === 'LOW_STOCK') {
        badges.push(
            <Badge key="low" tone="amber" icon={<PackageMinus className="h-3.5 w-3.5" aria-hidden />} title={`Only ${item.availableStock || 0} units available`}>Low stock</Badge>,
        );
    }
    if (isLoss) {
        badges.push(<Badge key="loss" tone="red" icon={<TrendingDown className="h-3.5 w-3.5" aria-hidden />}>Below cost</Badge>);
    }

    const discountLabel = item.discountType === 'amount'
        ? ((item.discountAmount ?? 0) > 0 ? `₹${Number(item.discountAmount).toFixed(2)} off` : null)
        : (item.discountPct > 0 ? `${parseFloat(item.discountPct.toFixed(2))}% off` : null);

    return (
        <li
            data-testid="cart-line-card"
            data-batch-id={item.batchId}
            className={cn('relative overflow-hidden rounded-xl border shadow-sm', isLoss ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white')}
        >
            <span aria-hidden data-testid="expiry-bar" data-status={expiryStatus} className={cn('absolute inset-y-0 left-0 w-1.5', BAR[expiryStatus])} />
            <button
                type="button"
                onClick={() => onEdit(item.batchId)}
                aria-label={`Edit ${item.name}`}
                className="flex min-h-[44px] w-full touch-manipulation flex-col gap-1.5 py-3 pl-4 pr-3 text-left active:bg-slate-50"
            >
                <span className="flex w-full items-start justify-between gap-3">
                    <span className="min-w-0">
                        <span className="line-clamp-2 text-base font-extrabold uppercase leading-snug text-slate-900">{item.name}</span>
                        {item.composition && <span className="mt-0.5 block truncate text-sm text-slate-600">{item.composition}</span>}
                    </span>
                    <span className={cn('shrink-0 text-xl font-black tabular-nums', isLoss ? 'text-red-700' : 'text-slate-900')} data-testid="line-amount">
                        ₹{item.totalAmount.toFixed(2)}
                    </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={T.tag}>B: {item.batchNo}</span>
                    <span className={cn(T.tag, EXPIRY_TEXT[expiryStatus])}>Exp: {formatExpiry(item.expiryDate)}</span>
                    {discountLabel && <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-extrabold tabular-nums text-sky-900">{discountLabel}</span>}
                </span>
                <span className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Qty</span>
                    <span data-testid="cart-qty-text" className="rounded-md bg-slate-900 px-2.5 py-1 text-sm font-extrabold tabular-nums text-white">{qtyText}</span>
                </span>
                {badges.length > 0 && <span className="flex flex-wrap gap-1.5">{badges}</span>}
                {showMargin && (
                    <span data-testid="line-margin" className={cn('text-xs font-semibold tabular-nums', isLoss ? 'font-bold text-red-800' : 'text-emerald-800')}>
                        Landing ₹{margin.costFloor.toFixed(2)} · Profit ₹{margin.lineGrossProfit.toFixed(2)} ({margin.marginPct.toFixed(1)}%)
                    </span>
                )}
            </button>
        </li>
    );
}
