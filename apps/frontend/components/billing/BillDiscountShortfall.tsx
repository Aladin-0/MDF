import { AlertTriangle } from 'lucide-react';
import type { BillTotals } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Says what happened to a bill discount that was cut: what was asked, what was given, and why. The discount is capped so
 * that no item sells below its cost; it used to be cut silently, which looks like the discount "not calculating". No cost
 * figure is shown: everyone at the counter may read this.
 *
 * It sits next to the total on every layout (desktop summary, tablet dock and Summary popup, phone bottom bar, totals
 * sheet and payment screen), so it cannot be missed after a popup is closed. `tone="dark"` for the dark docks.
 */
export function BillDiscountShortfall({ totals, tone = 'light', className }: { totals: BillTotals; tone?: 'light' | 'dark'; className?: string }) {
    const short = totals.extraDiscountShortfall ?? 0;
    if (!(short > 0)) return null;
    const given = totals.extraDiscountAmount;
    const asked = given + short;                    // two paisa amounts: toFixed(2) below shows their exact sum
    return (
        <p role="status" data-testid="bill-discount-shortfall"
           className={cn('flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold',
               tone === 'dark' ? 'border-amber-500/50 bg-amber-950/60 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900',
               className)}>
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">{`Discount asked ₹${asked.toFixed(2)}, given ₹${given.toFixed(2)}. More would sell items below cost.`}</span>
        </p>
    );
}
