'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Loader2, Trash2, Undo2 } from 'lucide-react';
import type { Batch, CartItem } from '@/types';
import { useBillingStore } from '@/store/billingStore';
import { canViewBillingMargins } from '@/lib/access';
import { allowsLoose } from '@/lib/packRules';
import { getExpiryStatus } from '@/utils/expiry';
import { cn } from '@/lib/utils';
import { SheetShell } from './SheetShell';
import { T } from './theme';
import { QtyStepper } from './QtyStepper';
import {
    batchFromItem, computeLine, describeStock, formatExpiry, itemDiscountValue, packQtyLabel, useLineBatches,
} from './CartLineCard';

const SNACKBAR_MS = 8000;

interface RemovedLine {
    item: CartItem;
    draftId: string;
}

const numeric = (raw: string) => raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
    return <label htmlFor={htmlFor} className={cn('mb-1 block', T.label)}>{children}</label>;
}

const decimalInput = cn('h-12 w-full min-w-0 touch-manipulation px-3 text-center text-base font-bold tabular-nums', T.input);

interface EditorProps {
    item: CartItem;
    onClose: () => void;
    onRemoved: (removed: RemovedLine) => void;
}

function LineEditorBody({ item, onClose, onRemoved }: EditorProps) {
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const saleType = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId]?.saleType : undefined)) || 'RETAIL';
    const role = useBillingStore((s) => s.activeStaff?.role);
    const { updateCartItem, removeFromCart, addToCart } = useBillingStore.getState();
    const showMargin = canViewBillingMargins(role);
    const { batches, isFetching } = useLineBatches(item);

    const [batchId, setBatchId] = useState(item.batchId);
    const [qtyStrips, setQtyStrips] = useState(item.qtyStrips);
    const [qtyLoose, setQtyLoose] = useState(item.qtyLoose);
    const [discountType, setDiscountType] = useState<'percentage' | 'amount'>(item.discountType || 'percentage');
    const [discountValue, setDiscountValue] = useState(itemDiscountValue(item));
    const [freeStrips, setFreeStrips] = useState(item.freeQtyStrips ?? 0);
    const [freeLoose, setFreeLoose] = useState(item.freeQtyLoose ?? 0);
    const initialRate = (item.saleRate || item.mrp)?.toString() || '';
    const [ptr, setPtr] = useState(item.ptr?.toString() || initialRate);
    const [pts, setPts] = useState(item.pts?.toString() || initialRate);
    const originalPtr = useRef(ptr);
    const originalPts = useRef(pts);

    // The batches that can be chosen: the product's non-expired batches; the line's own batch is always listed so the sheet never opens empty.
    const own = batches.find((b) => b.id === item.batchId) ?? batchFromItem(item);
    const choices: Batch[] = batches.filter((b) => getExpiryStatus(b.expiryDate) !== 'expired');
    if (!choices.some((b) => b.id === item.batchId)) choices.unshift(own);
    const current: Batch = choices.find((b) => b.id === batchId) ?? own;
    const sameBatch = batchId === item.batchId;
    const knownStock = batches.some((b) => b.id === current.id);   // the stand-in batch has no real stock figure

    const { totals, baseRate, hasLoose } = computeLine(
        item, current,
        { qtyStrips, qtyLoose, discountType, discountValue, ptr, pts, freeQtyStrips: freeStrips, freeQtyLoose: freeLoose },
        saleType, sameBatch,
    );
    const stockUnits = current.qtyStrips * current.packSize + current.qtyLoose;
    const costPerPack = totals.tQtyFractional > 0 ? totals.totalCost / totals.tQtyFractional : 0;
    const costWord = saleType === 'WHOLESALE' ? 'purchase rate' : 'landing cost';

    const pickBatch = (b: Batch) => {
        if (getExpiryStatus(b.expiryDate) === 'expired' && b.id !== item.batchId) return;
        setBatchId(b.id);
        if (b.id === item.batchId) {
            setPtr(originalPtr.current);
            setPts(originalPts.current);
        } else {
            setPtr(String(saleType === 'WHOLESALE' ? (b.ptr || b.mrp) : b.mrp));
            setPts(String(saleType === 'WHOLESALE' ? (b.pts || b.mrp) : b.mrp));
        }
    };

    const switchDiscountType = (next: 'percentage' | 'amount') => {
        if (next === discountType) return;
        setDiscountType(next);
        setDiscountValue('0');                    // same as the desktop editor: the number means something else now
    };

    const blockers: string[] = [];
    if (totals.isQtyZero) blockers.push('Quantity must be greater than 0.');
    if (totals.isDiscountInvalid) {
        blockers.push(discountType === 'percentage' ? 'Discount must be between 0 and 100%.' : 'Discount cannot be more than the line amount.');
    }
    if (totals.isNegativeMargin) {
        blockers.push(
            `Loss-making sale prevented: the price after discount is below the ${costWord}${showMargin ? ` (₹${costPerPack.toFixed(2)} per pack)` : ''}.`,
        );
    }

    const save = () => {
        if (!totals.isValid || !activeDraftId) return;
        const looseUsed = hasLoose ? qtyLoose : 0;
        const next: CartItem = {
            ...item,
            batchId: current.id,
            batchNo: current.batchNo,
            expiryDate: current.expiryDate,
            qtyStrips,
            qtyLoose: looseUsed,
            freeQtyStrips: saleType === 'WHOLESALE' ? freeStrips : item.freeQtyStrips,
            freeQtyLoose: saleType === 'WHOLESALE' ? (hasLoose ? freeLoose : 0) : item.freeQtyLoose,
            totalQty: totals.tQtyFractional,
            discountPct: totals.dPct,
            discountType,
            discountAmount: discountType === 'amount' ? totals.dAmount : undefined,
            rate: totals.rate,
            totalAmount: totals.sellAmount,
            mrp: current.mrp,
            saleRate: baseRate,
            purchaseRate: current.purchaseRate,
            landingRate: current.landingRate ?? current.purchaseRate,
            packSize: current.packSize,
            packUnit: current.packUnit,
            taxableAmount: totals.taxableAmount,
            gstAmount: totals.gstAmount,
            ptr: saleType === 'WHOLESALE' ? (parseFloat(ptr) || undefined) : undefined,
            pts: saleType === 'WHOLESALE' ? (parseFloat(pts) || undefined) : undefined,
        };
        if (next.batchId === item.batchId) {
            updateCartItem(activeDraftId, item.batchId, next);
        } else {
            // a different batch is a different line: same rule as the desktop editor
            removeFromCart(activeDraftId, item.batchId);
            addToCart(activeDraftId, next);
        }
        onClose();
    };

    const remove = () => {
        if (!activeDraftId) return;
        removeFromCart(activeDraftId, item.batchId);
        onRemoved({ item, draftId: activeDraftId });
        onClose();
    };

    const footer = (
        <div className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-3">
                {showMargin ? (
                    <div className={cn('flex min-w-0 gap-4 px-3 py-2 text-xs', T.dockPanel)} data-testid="editor-margin">
                        <div>
                            <div className={cn('text-xs font-bold uppercase tracking-wide', T.dockMuted)}>Est. cost</div>
                            <div className="text-sm font-bold tabular-nums text-sky-300">₹{totals.totalCost.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className={cn('text-xs font-bold uppercase tracking-wide', T.dockMuted)}>Margin</div>
                            <div className={cn('text-sm font-bold tabular-nums', totals.isNegativeMargin ? 'text-red-300' : totals.isLowMargin ? 'text-amber-300' : 'text-emerald-300')}>
                                ₹{totals.marginAmount.toFixed(2)} ({totals.marginPct.toFixed(1)}%)
                            </div>
                        </div>
                    </div>
                ) : <span />}
                <div className="text-right">
                    <div className={T.label}>Sell amount</div>
                    <div data-testid="editor-sell-amount" className="text-3xl font-black tabular-nums text-slate-900">₹{totals.sellAmount.toFixed(2)}</div>
                </div>
            </div>
            {blockers.length > 0 && (
                <ul role="alert" data-testid="editor-blockers" className="flex flex-col gap-1">
                    {blockers.map((b) => (
                        <li key={b} className="flex items-start gap-1.5 rounded-md bg-red-100 px-2 py-1.5 text-xs font-bold text-red-800">
                            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                            {b}
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={remove}
                    className="flex h-12 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-red-600 bg-white px-4 text-sm font-bold text-red-700 transition-colors active:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!totals.isValid}
                    className={cn('flex h-12 flex-1 touch-manipulation items-center justify-center gap-1.5 px-4 text-sm', T.cta)}
                >
                    <Check className="h-4 w-4" aria-hidden /> Save
                </button>
            </div>
        </div>
    );

    return (
        <SheetShell
            open
            onClose={onClose}
            title={item.name}
            description={`${item.composition ? `${item.composition} · ` : ''}1 ${packQtyLabel(hasLoose, current.packType).replace(/s$/, '').toLowerCase()} = ${current.packSize} ${current.packUnit}`}
            footer={footer}
        >
            <div className="flex flex-col gap-4">
                {/* Batch */}
                <div>
                    <FieldLabel>Batch {isFetching && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" aria-label="Loading batches…" />}</FieldLabel>
                    <div role="radiogroup" aria-label="Batch" className="flex flex-col gap-2">
                        {choices.map((b) => {
                            const selected = b.id === batchId;
                            const expired = getExpiryStatus(b.expiryDate) === 'expired';
                            const stock = b.qtyStrips * b.packSize + b.qtyLoose;
                            const real = batches.some((x) => x.id === b.id);
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={expired && b.id !== item.batchId}
                                    onClick={() => pickBatch(b)}
                                    className={cn(
                                        'flex min-h-[44px] touch-manipulation items-center justify-between gap-3 rounded-lg border-2 px-3 py-2 text-left text-sm',
                                        selected ? T.selected : 'border-slate-300 bg-white active:bg-slate-50',
                                    )}
                                >
                                    <span className="flex min-w-0 flex-col">
                                        <span className="font-mono font-bold text-slate-900">{b.batchNo}</span>
                                        <span className={cn('text-xs font-semibold', expired ? 'text-red-800' : 'text-slate-700')}>
                                            Exp {formatExpiry(b.expiryDate)}{expired ? ' · Expired' : ''}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-700">
                                        {real ? `${describeStock(stock, b.packSize, allowsLoose(b), b.packType)} in stock` : ''}
                                        {selected && <Check className="h-5 w-5 text-sky-700" aria-hidden />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Quantity */}
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                    <QtyStepper
                        label={packQtyLabel(hasLoose, current.packType)}
                        size="lg"
                        value={qtyStrips}
                        onChange={setQtyStrips}
                        testId="inline-qty-strips"
                    />
                    {hasLoose && (
                        <QtyStepper label="Loose" size="lg" value={qtyLoose} onChange={setQtyLoose} testId="inline-qty-loose" />
                    )}
                </div>

                {/* Discount */}
                <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <FieldLabel htmlFor="editor-discount">Discount</FieldLabel>
                    </div>
                    <div className="flex items-center gap-2">
                        <div role="group" aria-label="Discount type" className="flex shrink-0 overflow-hidden rounded-lg border-2 border-slate-400">
                            {([['percentage', '%'], ['amount', 'Rs']] as const).map(([type, text]) => (
                                <button
                                    key={type}
                                    type="button"
                                    aria-pressed={discountType === type}
                                    onClick={() => switchDiscountType(type)}
                                    className={cn('h-12 min-w-[3.25rem] touch-manipulation px-3 text-sm font-bold', discountType === type ? 'bg-sky-500 text-white' : 'bg-white text-slate-800 active:bg-slate-100')}
                                >
                                    {text}
                                </button>
                            ))}
                        </div>
                        <input
                            id="editor-discount"
                            data-testid="editor-discount"
                            inputMode="decimal"
                            value={discountValue}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setDiscountValue(numeric(e.target.value))}
                            className={decimalInput}
                        />
                    </div>
                </div>

                {/* Wholesale only */}
                {saleType === 'WHOLESALE' && (
                    <>
                        <div className="flex flex-wrap gap-x-4 gap-y-3">
                            <QtyStepper label={hasLoose ? 'Free qty (strips)' : 'Free qty'} value={freeStrips} onChange={setFreeStrips} testId="editor-free-strips" />
                            {hasLoose && <QtyStepper label="Free qty (loose)" value={freeLoose} onChange={setFreeLoose} testId="editor-free-loose" />}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <FieldLabel htmlFor="editor-ptr">PTR (Rs)</FieldLabel>
                                <input id="editor-ptr" data-testid="editor-ptr" inputMode="decimal" value={ptr} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPtr(numeric(e.target.value))} className={decimalInput} />
                            </div>
                            <div>
                                <FieldLabel htmlFor="editor-pts">PTS (Rs)</FieldLabel>
                                <input id="editor-pts" data-testid="editor-pts" inputMode="decimal" value={pts} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setPts(numeric(e.target.value))} className={decimalInput} />
                            </div>
                        </div>
                    </>
                )}

                {totals.exceedsStock && knownStock && (
                    <p role="status" data-testid="editor-stock-warning" className="flex items-start gap-1.5 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-bold text-amber-900">
                        <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                        Warning: quantity is more than the stock available ({describeStock(stockUnits, current.packSize, hasLoose, current.packType)}).
                    </p>
                )}
            </div>
        </SheetShell>
    );
}

/**
 * Bottom sheet that edits one cart line (tap a card). `item` = the line being edited, or null when closed.
 * Keep this component mounted while the bill is on screen (CartList does): the "Removed ... Undo" snackbar lives here, outside the sheet.
 */
export function LineEditorSheet({ item, onClose }: { item: CartItem | null; onClose: () => void }) {
    const [removed, setRemoved] = useState<RemovedLine | null>(null);

    useEffect(() => {
        if (!removed) return;
        const t = setTimeout(() => setRemoved(null), SNACKBAR_MS);
        return () => clearTimeout(t);
    }, [removed]);

    const undo = () => {
        if (!removed) return;
        useBillingStore.getState().addToCart(removed.draftId, removed.item);
        setRemoved(null);
    };

    return (
        <>
            {item && <LineEditorBody key={item.batchId} item={item} onClose={onClose} onRemoved={setRemoved} />}
            {removed && typeof document !== 'undefined' && createPortal(
                <div
                    role="status"
                    aria-live="polite"
                    data-testid="removed-snackbar"
                    className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] z-[80] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-lg"
                >
                    <span className="min-w-0 truncate font-medium">{`Removed ${removed.item.name}`}</span>
                    <button
                        type="button"
                        onClick={undo}
                        className="flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-sky-300 active:bg-slate-700"
                    >
                        <Undo2 className="h-4 w-4" aria-hidden /> Undo
                    </button>
                </div>,
                document.body,
            )}
        </>
    );
}
