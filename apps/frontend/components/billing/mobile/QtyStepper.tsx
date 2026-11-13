'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { T } from './theme';

interface QtyStepperProps {
    value: number;
    onChange: (next: number) => void;
    /** Visible label (e.g. "Strips", "Loose"): fields always have a label above, never placeholder-only */
    label: string;
    min?: number;
    max?: number;
    disabled?: boolean;
    /** `lg` = the big stepper of the Add sheet; `md` = the compact one on a cart card */
    size?: 'md' | 'lg';
    /** data-testid for the number field */
    testId?: string;
    /** Text after the number inside the field area, e.g. "of 10" */
    hint?: string;
}

/** [-] 2 [+]: 48px buttons (44px minimum touch target + gap), numeric keypad when typing, clamped to min/max. */
export function QtyStepper({ value, onChange, label, min = 0, max, disabled, size = 'md', testId, hint }: QtyStepperProps) {
    const clamp = (n: number) => {
        let v = Number.isFinite(n) ? Math.floor(n) : min;
        if (v < min) v = min;
        if (max !== undefined && v > max) v = max;
        return v;
    };
    const btn = cn(
        'flex shrink-0 touch-manipulation items-center justify-center rounded-lg border-2 border-slate-400 bg-white text-slate-900 transition-colors',
        'active:bg-slate-100 disabled:opacity-40 disabled:active:bg-white',
        size === 'lg' ? 'h-12 w-12' : 'h-11 w-11',
    );
    return (
        <div className="min-w-0">
            <div className={cn('mb-1', T.label)}>{label}</div>
            <div className="flex items-center gap-2">
                <button type="button" aria-label={`${label} decrease`} className={btn} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))}>
                    <Minus className="h-5 w-5" />
                </button>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={label}
                    data-testid={testId}
                    disabled={disabled}
                    value={String(value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0))}
                    className={cn(
                        'min-w-0 flex-1 touch-manipulation text-center font-bold tabular-nums',
                        T.input,
                        size === 'lg' ? 'h-12 text-xl' : 'h-11 text-base',
                    )}
                    style={{ maxWidth: size === 'lg' ? '7rem' : '5rem' }}
                />
                <button type="button" aria-label={`${label} increase`} className={btn} disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(clamp(value + 1))}>
                    <Plus className="h-5 w-5" />
                </button>
                {hint && <span className="shrink-0 text-xs font-semibold text-slate-700">{hint}</span>}
            </div>
        </div>
    );
}
