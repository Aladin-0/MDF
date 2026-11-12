'use client';

import { cn } from '@/lib/utils';
import { VALUATION_LABELS, type ValuationMode } from '@/lib/inventory';

interface ValuationToggleProps {
    value: ValuationMode;
    onChange: (mode: ValuationMode) => void;
    className?: string;
}

/** "Value stock at: Purchase | Landing | MRP". It changes the Stock Value card and the Total Value column. */
export function ValuationToggle({ value, onChange, className }: ValuationToggleProps) {
    return (
        <div role="group" aria-label="Value stock at" className={cn('inline-flex rounded-md bg-muted p-0.5', className)}>
            {(Object.keys(VALUATION_LABELS) as ValuationMode[]).map((mode) => (
                <button
                    key={mode}
                    type="button"
                    aria-pressed={value === mode}
                    onClick={() => onChange(mode)}
                    className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        value === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {VALUATION_LABELS[mode]}
                </button>
            ))}
        </div>
    );
}
