'use client';

import { useEffect, useState } from 'react';
import { ScanLine, Search } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { canViewBillingMargins } from '@/lib/access';
import { cn } from '@/lib/utils';
import { T } from './theme';
import { CartLineCard } from './CartLineCard';
import { LineEditorSheet } from './LineEditorSheet';

/**
 * The bill as a list of cards (phone). Scrolls inside its parent; the bottom padding clears the pinned SummaryBar.
 * Tapping a card opens the line editor; this component owns that sheet so its "Removed ... Undo" snackbar outlives the sheet.
 */
export function CartList() {
    const drafts = useBillingStore((s) => s.drafts);
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const showMarginInfo = useBillingStore((s) => s.showMarginInfo);
    const activeStaff = useBillingStore((s) => s.activeStaff);
    const landingCostIncludeGst = useBillingStore((s) => s.landingCostIncludeGst);
    const [editingBatchId, setEditingBatchId] = useState<string | null>(null);

    const draft = activeDraftId ? drafts[activeDraftId] : undefined;
    const cart = draft?.cart ?? [];
    const editingItem = editingBatchId ? cart.find((c) => c.batchId === editingBatchId) ?? null : null;

    // the line was removed or the bill switched while the editor was open: nothing to edit any more
    useEffect(() => {
        if (editingBatchId && !editingItem) setEditingBatchId(null);
    }, [editingBatchId, editingItem]);

    const showMargin = canViewBillingMargins(activeStaff?.role) && showMarginInfo;

    return (
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-48', T.page)} data-testid="mobile-cart-list">
            {draft && cart.length > 0 ? (
                <>
                    <div className={cn('flex items-center justify-between border-y border-slate-300 px-4 py-2', T.band)}>
                        <span data-testid="cart-summary-items" className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            {cart.length} {cart.length === 1 ? 'Item' : 'Items'}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-800">Tap a medicine to edit</span>
                    </div>
                    <ul className="flex flex-col gap-3 px-3 pt-3">
                        {cart.map((item, index) => (
                            <CartLineCard
                                key={`${item.batchId}-${index}`}
                                item={item}
                                draftId={draft.id}
                                saleType={draft.saleType || 'RETAIL'}
                                showMargin={showMargin}
                                extraDiscountPct={draft.extraDiscountPct || 0}
                                landingCostIncludeGst={landingCostIncludeGst}
                                onEdit={setEditingBatchId}
                            />
                        ))}
                    </ul>
                </>
            ) : (
                <div data-testid="cart-empty" className="flex flex-col items-center justify-center gap-3 px-9 py-16 text-center">
                    <div className="flex items-center gap-3 text-slate-500" aria-hidden>
                        <Search className="h-14 w-14" />
                        <ScanLine className="h-14 w-14" />
                    </div>
                    <p className="text-base font-semibold text-slate-700">Search or scan a medicine to start the bill</p>
                </div>
            )}
            <LineEditorSheet item={editingItem} onClose={() => setEditingBatchId(null)} />
        </div>
    );
}
