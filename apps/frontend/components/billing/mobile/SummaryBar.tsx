'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronUp, Loader2 } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { cn } from '@/lib/utils';
import { T } from './theme';

interface SummaryBarProps {
    /** Main button text, follows the mode: "Collect ₹1,038", "Save quotation", "Save changes" */
    label: string;
    /** Why the main button is off ("Add items", "Customer needed for credit"...). null = enabled. Shown as one line above the button. */
    disabledReason: string | null;
    submitting: boolean;
    onCollect: () => void;
    /** Tap on items / NET PAYABLE */
    onOpenTotals: () => void;
}

const isTextEntry = (el: Element | null) => {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true;
};

/** True while a field has focus AND the on-screen keyboard has shrunk the visual viewport (so the bar is not stacked above the keyboard). */
function useKeyboardOpen(): boolean {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const vv = window.visualViewport;
        if (!vv) return;                                    // jsdom / old browsers: never hide
        let baseline = Math.max(window.innerHeight, vv.height);
        const update = () => {
            baseline = Math.max(baseline, vv.height);
            const shrunk = baseline - vv.height > 120;      // a keyboard is far taller than any browser bar
            setOpen(shrunk && isTextEntry(document.activeElement));
        };
        update();
        vv.addEventListener('resize', update);
        document.addEventListener('focusin', update);
        document.addEventListener('focusout', update);
        return () => {
            vv.removeEventListener('resize', update);
            document.removeEventListener('focusin', update);
            document.removeEventListener('focusout', update);
        };
    }, []);
    return open;
}

/** Pinned bottom bar of the phone bill: items + packs, NET PAYABLE (tap = totals sheet) and the one main button. */
export function SummaryBar({ label, disabledReason, submitting, onCollect, onOpenTotals }: SummaryBarProps) {
    const drafts = useBillingStore((s) => s.drafts);
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const getDraftTotals = useBillingStore((s) => s.getDraftTotals);
    const keyboardOpen = useKeyboardOpen();

    const draft = activeDraftId ? drafts[activeDraftId] : undefined;
    const cart = draft?.cart ?? [];
    const totals = activeDraftId ? getDraftTotals(activeDraftId) : null;
    const strips = cart.reduce((sum, i) => sum + (i.qtyStrips || 0), 0);
    const loose = cart.reduce((sum, i) => sum + (i.qtyLoose || 0), 0);
    const packs = `${strips} ${strips === 1 ? 'pack' : 'packs'}${loose > 0 ? ` + ${loose} loose` : ''}`;
    const disabled = !!disabledReason || submitting;

    return (
        <div
            data-testid="summary-bar"
            aria-hidden={keyboardOpen || undefined}
            style={keyboardOpen ? { display: 'none' } : undefined}
            className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(0,0,0,0.25)]', T.dock)}
        >
            <button
                type="button"
                onClick={onOpenTotals}
                aria-label="Show bill totals"
                className="flex min-h-[56px] w-full touch-manipulation items-center justify-between gap-3 rounded-lg px-1 text-left active:bg-slate-800"
            >
                <span className="min-w-0">
                    <span data-testid="summary-items" className={cn('block truncate text-xs font-semibold tabular-nums', T.dockMuted)}>
                        {cart.length} {cart.length === 1 ? 'item' : 'items'} · {packs}
                    </span>
                    <span className={cn('block text-xs font-bold uppercase tracking-widest', T.dockMuted)}>Net payable</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                    <span data-testid="grand-total-amount" className={cn('text-3xl font-black text-white', T.money)}>
                        ₹{(totals?.grandTotal ?? 0).toFixed(2)}
                    </span>
                    <ChevronUp className="h-5 w-5 text-slate-300" aria-hidden />
                </span>
            </button>
            {disabledReason && !submitting && (
                <p data-testid="checkout-disabled-reason" role="status" className="mb-1.5 mt-1 flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0">{disabledReason}</span>
                </p>
            )}
            <button
                type="button"
                data-testid="checkout-button"
                disabled={disabled}
                aria-busy={submitting || undefined}
                onClick={onCollect}
                className={cn(
                    'mt-1 flex h-14 w-full touch-manipulation items-center justify-center gap-2 px-4 text-base',
                    T.cta,
                    'disabled:bg-slate-700 disabled:text-slate-300',
                )}
            >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                {label}
            </button>
        </div>
    );
}
