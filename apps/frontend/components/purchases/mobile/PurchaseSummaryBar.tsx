'use client';

import { AlertTriangle, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T } from '@/components/billing/mobile/theme';
import { fmt } from '@/lib/purchaseEntry';

interface PurchaseSummaryBarProps {
    medicines: number;
    units: number;
    netPayable: number;
    label: string;
    /** The first thing stopping the save, in words; tapping it goes to the fix. null = ready. */
    disabledReason: string | null;
    onFix: () => void;
    submitting: boolean;
    onSave: () => void;
    onOpenTotals: () => void;
}

/**
 * The pinned navy bar at the bottom: how many medicines, the net payable (tap for the whole breakdown) and the Save button.
 * While something is missing the button is off and the reason sits above it as a tappable line.
 */
export function PurchaseSummaryBar({ medicines, units, netPayable, label, disabledReason, onFix, submitting, onSave, onOpenTotals }: PurchaseSummaryBarProps) {
    return (
        <div data-testid="purchase-summary-bar" className={cn(T.dock, 'fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.35)]')}>
            <button type="button" data-testid="open-totals" onClick={onOpenTotals} aria-label="Show the full purchase total"
                className="flex min-h-[48px] w-full touch-manipulation items-center justify-between gap-3 text-left">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-300" data-testid="bar-counts">
                    {medicines} {medicines === 1 ? 'medicine' : 'medicines'} · {units.toLocaleString('en-IN')} units
                    <span className="block">Net payable</span>
                </span>
                <span className={cn('flex items-center gap-1 text-3xl font-black', T.money)} data-testid="bar-net">
                    {fmt(netPayable)}
                    <ChevronUp className="h-5 w-5 text-slate-300" aria-hidden />
                </span>
            </button>
            {disabledReason && (
                <button type="button" data-testid="bar-reason" onClick={onFix}
                    className="mb-2 flex min-h-[40px] w-full touch-manipulation items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-left text-sm font-bold text-amber-300 active:bg-slate-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{disabledReason}</span><span className="shrink-0 text-xs text-sky-300">Fix</span>
                </button>
            )}
            <button type="button" data-testid="save-purchase" disabled={!!disabledReason || submitting} onClick={onSave} className={cn(T.cta, 'flex h-14 w-full touch-manipulation items-center justify-center gap-2 text-base')}>
                {submitting ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden />Saving…</>) : label}
            </button>
        </div>
    );
}
