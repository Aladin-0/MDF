'use client';

import { Button } from '@/components/ui/button';

interface ShowMoreRowsProps {
    shown: number;
    total: number;
    step: number;
    onShowMore: () => void;
}

/** "Showing 200 of 4,532 rows · Show 200 more", under a long report table (see hooks/useShownRows). */
export function ShowMoreRows({ shown, total, step, onShowMore }: ShowMoreRowsProps) {
    if (shown >= total) return null;
    const next = Math.min(step, total - shown);
    return (
        <div className="flex flex-col items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:justify-between">
            <span>
                Showing {shown.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} rows (totals include all of them)
            </span>
            <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onShowMore}>
                Show {next.toLocaleString('en-IN')} more
            </Button>
        </div>
    );
}
