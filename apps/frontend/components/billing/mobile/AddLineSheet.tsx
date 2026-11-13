'use client';

import { useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useOutletId } from '@/hooks/useOutletId';
import { AlertCircle, Check } from 'lucide-react';
import { SheetShell } from './SheetShell';
import { QtyStepper } from './QtyStepper';
import { useBillingStore } from '@/store/billingStore';
import { allowsLoose, wholePackWord } from '@/lib/packRules';
import { batchStockUnits, defaultRateFor, quickAddLine } from '@/lib/cartLine';
import { cn } from '@/lib/utils';
import { T } from './theme';
import { getExpiryStatus } from '@/utils/expiry';
import type { Batch, CartItem, ProductSearchResult } from '@/types';

/** Same rule as the desktop quick-add: unexpired and something on the shelf. */
export function isBatchSellable(b: Pick<Batch, 'expiryDate' | 'qtyStrips' | 'qtyLoose'>): boolean {
    return !isBatchExpired(b) && hasBatchStock(b);
}
export function isBatchExpired(b: Pick<Batch, 'expiryDate'>): boolean {
    return b.expiryDate ? new Date(b.expiryDate) < new Date() : false;
}
export function hasBatchStock(b: Pick<Batch, 'qtyStrips' | 'qtyLoose'>): boolean {
    return b.qtyStrips > 0 || b.qtyLoose > 0;
}
export function sellableBatches(product: Pick<ProductSearchResult, 'batches'>): Batch[] {
    return (product.batches || []).filter(isBatchSellable);
}

/** "2027-06-30" or "06/27" -> "06/27" (read from the text, no time-zone surprises). */
export function formatExpiry(value?: string | null): string {
    if (!value) return '—';
    const iso = /^(\d{4})-(\d{2})/.exec(value);
    if (iso) return `${iso[2]}/${iso[1].slice(2)}`;
    return value;
}

/** "10 in stock", "3 strips + 4 loose in stock" ... given strips (may be fractional) of a pack. Same wording as the desktop search row. */
export function stockWording(totalStrips: number, pack: { packSize?: number; packType?: string; allowsLoose?: boolean }): string {
    const total = totalStrips || 0;
    if (!allowsLoose(pack)) return `${total} in stock`;
    const word = wholePackWord(pack.packType);
    const strips = Math.floor(total);
    const loose = Math.round((total - strips) * (pack.packSize || 1));
    if (strips > 0 && loose > 0) return `${strips} ${word}s + ${loose} loose in stock`;
    if (strips > 0) return `${strips} ${word}s in stock`;
    if (loose > 0) return `${loose} loose in stock`;
    return '0 in stock';
}

function batchStockWording(b: Batch): string {
    const total = b.packSize > 0 ? batchStockUnits(b) / b.packSize : b.qtyStrips;
    return stockWording(total, b);
}

/** "2 strips" / "2 strips + 3 loose" for the lines of this product already in the bill, or null when it is not in the bill. */
export function describeInBill(cart: CartItem[] | undefined, productId: string): string | null {
    const lines = (cart || []).filter((i) => i.productId === productId);
    if (lines.length === 0) return null;
    const strips = lines.reduce((n, i) => n + (i.qtyStrips || 0), 0);
    const loose = lines.reduce((n, i) => n + (i.qtyLoose || 0), 0);
    const word = wholePackWord(lines[0].packType);
    const parts: string[] = [];
    if (strips > 0) parts.push(`${strips} ${word}${strips === 1 ? '' : 's'}`);
    if (loose > 0) parts.push(`${loose} loose`);
    return parts.join(' + ') || 'in bill';
}

/** "strip" -> "Strips", "box" -> "Boxes" */
function pluralLabel(word: string): string {
    const cap = word.charAt(0).toUpperCase() + word.slice(1);
    return /(x|s|ch|sh)$/.test(word) ? `${cap}es` : `${cap}s`;
}

const money = (n: number) => `₹${n.toFixed(2)}`;

interface AddLineSheetProps {
    /** The medicine being added; the sheet is open while this is set */
    product: ProductSearchResult | null;
    onClose: () => void;
    /** Called after the line is in the cart, e.g. ("DOLO 650", "x2"). The caller returns to the bill. */
    onAdded: (name: string, qtyText: string) => void;
}

/**
 * Bottom sheet that turns a tapped search result into a bill line (design section 3.2 "Add sheet").
 * All the maths (rate, loose rule, GST split, stock block) is `quickAddLine` from lib/cartLine.ts, the same code the desktop quick-add uses.
 */
export function AddLineSheet({ product, onClose, onAdded }: AddLineSheetProps) {
    if (!product) return null;
    return <AddLineBody key={product.id} product={product} onClose={onClose} onAdded={onAdded} />;
}

/** The app's query client when there is one (the sheet also works without it, e.g. in isolated tests). */
function useOptionalQueryClient(): QueryClient | null {
    try { return useQueryClient(); } catch { return null; }
}

function AddLineBody({ product, onClose, onAdded }: AddLineSheetProps & { product: ProductSearchResult }) {
    const { activeDraftId, drafts, addToCart } = useBillingStore();
    const queryClient = useOptionalQueryClient();
    const outletId = useOutletId();
    const saleType = (activeDraftId && drafts?.[activeDraftId]?.saleType) || 'RETAIL';

    const valid = sellableBatches(product);
    const [batchId, setBatchId] = useState<string | null>(valid.length === 1 ? valid[0].id : null);
    const [strips, setStrips] = useState(1);
    const [loose, setLoose] = useState(0);
    const [discount, setDiscount] = useState('');
    const [tried, setTried] = useState(false);       // the "enter a quantity" hint only appears after a tap on Add to bill

    const batch = valid.find((b) => b.id === batchId) ?? null;
    // the same batch is already a line in this bill: adding again increases that line (the store sums the quantity)
    const inBillLine = batch && activeDraftId ? (drafts?.[activeDraftId]?.cart || []).find((i) => i.batchId === batch.id) ?? null : null;
    const looseOk = batch ? allowsLoose(batch) : false;
    const built = batch
        ? quickAddLine({ product, batch, qtyStrips: strips, qtyLoose: looseOk ? loose : 0, discountPct: discount, saleType })
        : null;
    const exceeds = built && !built.ok && built.reason === 'exceeds_stock' ? built.message : '';
    const noQty = built && !built.ok && built.reason === 'no_qty';
    const lineTotal = built && built.ok ? built.item.totalAmount : 0;

    const pickBatch = (b: Batch) => {
        setBatchId(b.id);
        setStrips(1);
        setLoose(0);
    };

    const onDiscount = (raw: string) => {
        let t = raw.replace(/[^0-9.]/g, '');
        const dot = t.indexOf('.');
        if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '');
        if (parseFloat(t) > 100) t = '100';
        setDiscount(t);
    };

    const submit = () => {
        if (!batch || !built) return;
        setTried(true);
        if (!built.ok) return;      // the reason (no quantity / over stock) is already shown inline
        if (!activeDraftId) return;
        addToCart(activeDraftId, built.item);
        // The new cart card reads this product's batches with this exact query key; hand it what we already have so the card shows
        // at once, with no network call, when the sheet closes (this was part of the lag coming back to the bill).
        if (queryClient && outletId) queryClient.setQueryData(['product', 'search', product.name, outletId], (old: unknown) => (Array.isArray(old) && old.length ? old : [product]));
        const parts: string[] = [];
        const l = built.item.qtyLoose || 0;
        if (built.item.qtyStrips > 0) parts.push(`x${built.item.qtyStrips}`);
        if (l > 0) parts.push(built.item.qtyStrips > 0 ? `+ ${l} loose` : `${l} loose`);
        onAdded(product.name, parts.join(' '));
        onClose();
    };

    const activeRate = batch ? defaultRateFor(batch, saleType) : 0;
    const activeLabel = batch ? (batch.pts ? 'PTS' : batch.ptr ? 'PTR' : 'MRP') : '';
    const word = wholePackWord(batch?.packType || product.packType);

    const footer = (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-2.5 text-white">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-300">Line total</span>
                <span data-testid="add-line-total" className={cn('text-2xl font-extrabold', T.money)}>{batch ? money(lineTotal) : '—'}</span>
            </div>
            <button
                type="button"
                data-testid="add-to-bill"
                disabled={!batch}
                onClick={submit}
                className={cn('h-14 w-full touch-manipulation text-base', T.cta)}
            >
                Add to bill
            </button>
        </div>
    );

    return (
        <SheetShell open onClose={onClose} title={product.name} description={`${product.composition || '—'} · ${product.packSize} ${product.packUnit}`} footer={footer} bodyClassName={cn(T.page, 'px-3')}>
            <div className="space-y-3">
                {/* Step 1: batch */}
                <section className={cn('overflow-hidden', T.card)}>
                    <StepTitle n={1} text="Choose batch" />
                    <div className="space-y-2 p-3" role="group" aria-label="Batch">
                        {(product.batches || []).map((b) => {
                            const expired = isBatchExpired(b);
                            const empty = !hasBatchStock(b);
                            const disabled = expired || empty;
                            const selected = b.id === batchId;
                            const exp = getExpiryStatus(b.expiryDate);
                            // the 6px bar on the left of the card, same colours as the desktop expiry bar
                            const expBar = expired || exp === 'expired' ? 'bg-red-500' : exp === 'expiring_soon' ? 'bg-amber-500' : exp === 'near_expiry' ? 'bg-yellow-400' : 'bg-emerald-500';
                            const rate = defaultRateFor(b, saleType);
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    data-testid={`batch-chip-${b.id}`}
                                    aria-pressed={selected}
                                    disabled={disabled}
                                    onClick={() => pickBatch(b)}
                                    className={cn(
                                        'relative flex min-h-[68px] w-full touch-manipulation items-center gap-3 overflow-hidden rounded-lg border py-2 pl-5 pr-3 text-left transition-colors',
                                        selected ? T.selected : 'border-slate-300 bg-white active:bg-slate-50',
                                        disabled && 'cursor-not-allowed border-dashed border-slate-400 bg-slate-100',
                                    )}
                                >
                                    <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', expBar)} />
                                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white')} aria-hidden>
                                        {selected && <Check className="h-4 w-4" strokeWidth={3} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <span className={cn('max-w-full truncate', T.tag)}>B: {b.batchNo}</span>
                                            <span className={T.tag}>Exp: {formatExpiry(b.expiryDate)}{expired ? ' · Expired' : ''}</span>
                                        </span>
                                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                                            <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', empty ? 'bg-red-100 text-red-900' : 'bg-emerald-100 text-emerald-900')}>{empty ? 'No stock' : batchStockWording(b)}</span>
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className={cn('block text-xl font-black text-slate-900', T.money)}>{money(rate)}</span>
                                        <span className="block text-xs font-bold text-slate-700">{saleType === 'WHOLESALE' ? (b.pts ? 'PTS' : b.ptr ? 'PTR' : 'MRP') : 'MRP'}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {!batch && valid.length > 1 && <p className="border-t border-slate-200 px-3 py-2 text-sm font-bold text-sky-800">Tap a batch to continue.</p>}
                </section>

                {batch && (
                    <>
                        {/* Step 2: quantity */}
                        <section className="overflow-hidden rounded-xl border-2 border-sky-300 bg-sky-50 shadow-sm">
                            <StepTitle n={2} text="How many?" />
                            <div className="p-3">
                            {inBillLine && (
                                <p data-testid="already-in-bill" className="mb-3 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-900">
                                    Already in the bill: {describeInBill([inBillLine], product.id)}. This adds more to it.
                                </p>
                            )}
                            <div className={cn('grid gap-4', looseOk ? 'grid-cols-1 min-[400px]:grid-cols-2' : 'grid-cols-1')}>
                                <QtyStepper size="lg" label={pluralLabel(word)} value={strips} onChange={setStrips} testId="quick-qty-strips" />
                                {looseOk && <QtyStepper size="lg" label="Loose" value={loose} onChange={setLoose} testId="quick-qty-loose" />}
                            </div>

                            {saleType === 'WHOLESALE' ? (
                                <div className="mt-3">
                                    <div className={cn('mb-1', T.label)}>Rate (per {word})</div>
                                    <div className="flex gap-2" data-testid="rate-chips">
                                        {([['PTS', batch.pts], ['PTR', batch.ptr], ['MRP', batch.mrp]] as const).map(([label, value]) => {
                                            const inUse = label === activeLabel;
                                            return (
                                                <div
                                                    key={label}
                                                    data-testid={`rate-${label}`}
                                                    data-active={inUse ? 'true' : 'false'}
                                                    className={cn(
                                                        'flex min-h-[44px] flex-1 flex-col justify-center rounded-lg border-2 px-2 py-1 text-center',
                                                        inUse ? 'border-sky-500 bg-white text-sky-800 ring-1 ring-sky-500' : 'border-slate-300 bg-white text-slate-700',
                                                    )}
                                                >
                                                    <span className="text-xs font-bold">{label}{inUse ? ' · in use' : ''}</span>
                                                    <span className={cn('text-sm font-bold', T.money)}>{value ? money(value) : '—'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm font-semibold text-slate-900">
                                    Rate <span className={T.money}>{money(activeRate)}</span> per {word}
                                </p>
                            )}

                            <div className="mt-3 flex items-center gap-3">
                                <label htmlFor="add-line-discount" className={T.label}>Discount %</label>
                                <input
                                    id="add-line-discount"
                                    data-testid="add-line-discount"
                                    type="text"
                                    inputMode="decimal"
                                    value={discount}
                                    onChange={(e) => onDiscount(e.target.value)}
                                    onFocus={(e) => e.currentTarget.select()}
                                    placeholder="0"
                                    className={cn('h-12 w-28 touch-manipulation px-3 text-base font-bold', T.money, T.input)}
                                />
                            </div>
                            </div>
                        </section>

                        {exceeds && (
                            <p role="alert" data-testid="add-line-error" className="flex items-start gap-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {exceeds}
                            </p>
                        )}
                        {noQty && tried && (
                            <p role="alert" data-testid="add-line-hint" className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Enter how many to add.
                            </p>
                        )}
                    </>
                )}
            </div>
        </SheetShell>
    );
}

/** "1  Choose batch": a slate band (like the desktop table header) with the step number in a navy circle. */
function StepTitle({ n, text }: { n: number; text: string }) {
    return (
        <div className={cn('flex items-center gap-2 px-3 py-2', T.band)}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white" aria-hidden>{n}</span>
            <h3>{text}</h3>
        </div>
    );
}
