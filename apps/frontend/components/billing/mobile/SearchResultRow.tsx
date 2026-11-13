'use client';

import { AlertTriangle, ArrowLeftRight, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T } from './theme';
import { describeInBill, formatExpiry, sellableBatches, stockWording } from './AddLineSheet';
import type { ProductSearchResult } from '@/types';

interface SearchResultRowProps {
    product: ProductSearchResult;
    /** The one way to add: opens the Add sheet (only offered when the product has a sellable batch) */
    onAdd: (product: ProductSearchResult) => void;
    /** This medicine is already in the bill: how much, e.g. "2 strips" (the button then says Add more) */
    inBill?: string | null;
    /** Show the `Substitutes` button (hidden while the substitutes list itself is open) */
    onSubstitutes?: (product: ProductSearchResult) => void;
    /** Present only when the user may add to the Shortbook (create_bills / create_purchases) */
    onShortbook?: (product: ProductSearchResult) => void;
    /** This product was already put on the Shortbook in this session */
    shortbookDone?: boolean;
}

const badge = 'rounded px-1.5 py-0.5 text-xs font-bold';

const rowBtn = 'flex h-12 flex-1 touch-manipulation items-center justify-center gap-1.5 px-3 text-sm';

/** One medicine in the phone search list: ONE way to add it (the Add button; the row itself is not a second button), stock and expiry in words as well as colour. */
export function SearchResultRow({ product, onAdd, inBill, onSubstitutes, onShortbook, shortbookDone }: SearchResultRowProps) {
    const inStock = (product.totalStock || 0) > 0;
    const canSell = sellableBatches(product).length > 0;
    const price = product.matchedMrp ?? product.mrp;
    const sub = product.substitute;

    return (
        <li
            data-testid="search-result-row"
            className={cn('p-3', T.card)}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-base font-bold leading-tight text-slate-900">{product.name}</span>
                        {product.isLowStock && inStock && <AlertTriangle aria-label="Low stock" className="h-4 w-4 shrink-0 text-amber-600" />}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-slate-600">
                        {product.composition || '—'} · {product.packSize} {product.packUnit}
                    </div>
                    {inBill && (
                        <div className="mt-1.5">
                            <span data-testid="in-bill-badge" className={cn(badge, 'inline-flex items-center gap-1 bg-sky-100 text-sky-900')}>
                                <Check className="h-3.5 w-3.5" aria-hidden /> In bill · {inBill}
                            </span>
                        </div>
                    )}
                    {sub && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {sub.sameStrength === true && <span className={cn(badge, 'bg-emerald-100 text-emerald-900')}>Same strength</span>}
                            {sub.sameStrength === false && <span className={cn(badge, 'bg-amber-100 text-amber-900')}>Different strength</span>}
                            {sub.sameForm === false && <span className={cn(badge, 'bg-amber-100 text-amber-900')}>Different form</span>}
                        </div>
                    )}
                </div>
                <div className={cn('shrink-0 text-right text-lg font-black text-slate-900', T.money)} data-testid="result-price">₹{price.toFixed(2)}</div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
                <span data-testid="stock-chip" className={cn('inline-flex items-center gap-1.5 rounded px-2 py-1', inStock ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900')}>
                    <span aria-hidden className={cn('h-2 w-2 rounded-full', inStock ? 'bg-emerald-600' : 'bg-red-600')} />
                    {inStock ? stockWording(product.totalStock, product) : 'Out of stock'}
                </span>
                {product.nearestExpiry && inStock && <span className={T.tag}>exp {formatExpiry(product.nearestExpiry)}</span>}
            </div>

            {!canSell && (
                <p data-testid="no-valid-stock" className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">
                    {(product.batches || []).length === 0
                        ? `No stock available for ${product.name}.`
                        : `No valid stock (unexpired, quantity above 0) for ${product.name}.`}
                </p>
            )}

            <div className="mt-3 flex gap-2">
                {onSubstitutes && (
                    <button
                        type="button"
                        data-testid="show-substitutes"
                        onClick={() => onSubstitutes(product)}
                        className={cn(rowBtn, T.btn)}
                    >
                        <ArrowLeftRight className="h-4 w-4" /> Substitutes
                    </button>
                )}
                {canSell ? (
                    <button
                        type="button"
                        data-testid="add-product"
                        onClick={() => onAdd(product)}
                        className={cn(rowBtn, T.cta)}
                    >
                        <Plus className="h-4 w-4" aria-hidden /> {inBill ? 'Add more' : 'Add'}
                    </button>
                ) : onShortbook ? (
                    shortbookDone ? (
                        <span className={cn(rowBtn, 'rounded-xl bg-emerald-100 font-bold text-emerald-900')}>
                            <Check className="h-4 w-4" /> On the Shortbook
                        </span>
                    ) : (
                        <button
                            type="button"
                            data-testid="add-to-shortbook"
                            onClick={() => onShortbook(product)}
                            className="flex h-12 flex-1 touch-manipulation items-center justify-center rounded-xl border-2 border-red-400 bg-white px-3 text-sm font-bold text-red-800 active:bg-red-50"
                        >
                            Add to Shortbook
                        </button>
                    )
                ) : null}
            </div>
        </li>
    );
}
