'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { T } from '@/components/billing/mobile/theme';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

interface NumFieldProps {
    /** The same name as the desktop grid column (QTY, MRP, RATE ...) */
    label: string;
    value: number;
    onChange: (n: number) => void;
    /** `numeric` for whole numbers (quantities), `decimal` for money and percentages */
    mode?: 'numeric' | 'decimal';
    /** Text before the number inside the box, e.g. ₹ */
    prefix?: string;
    suffix?: string;
    placeholder?: string;
    testId?: string;
    /** Shows the box as invalid; with `errorText` it also says what to do (read out by screen readers) */
    error?: boolean;
    errorText?: string;
    hint?: string;
    autoFocus?: boolean;
    id?: string;
    onBlur?: () => void;
}

/** Keep digits and (for decimals) a single dot with at most 2 decimals, so "0." and "12.5" can be typed on a phone keyboard. */
export const cleanNumber = (raw: string, decimal: boolean): string => {
    if (!decimal) return raw.trim().match(/^\d*/)?.[0] ?? '';      // whole numbers stop at the first non-digit: dropping the "." would turn 1.5 into 15
    const s = raw.replace(/[^0-9.]/g, '');
    const [i, ...rest] = s.split('.');
    return rest.length ? `${i}.${rest.join('').slice(0, 2)}` : i;
};

/**
 * A labelled number box for the phone line editor (shadcn `Field` + `FieldLabel` + `FieldDescription` + `FieldError`). It keeps what you typed
 * as text (so "0." stays "0." while you type) and only sends a number up; when the number is changed from outside (e.g. the PTR filled from
 * the MRP) the text follows.
 */
export function NumField({ label, value, onChange, mode = 'decimal', prefix, suffix, placeholder = '0', testId, error, errorText, hint, autoFocus, id, onBlur }: NumFieldProps) {
    const [text, setText] = useState(value ? String(value) : '');
    useEffect(() => {
        // a different number from outside (not just the text we typed parsing to the same number)
        if ((parseFloat(text) || 0) !== (value || 0)) setText(value ? String(value) : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    const fieldId = id || `num-${testId || label.replace(/\W+/g, '-').toLowerCase()}`;
    const hintId = `${fieldId}-hint`;
    const errId = `${fieldId}-error`;
    const showError = !!error && !!errorText;
    return (
        <Field data-invalid={error || undefined} className="min-w-0 gap-1">
            <FieldLabel htmlFor={fieldId} className={cn(T.label, 'w-full')}>{label}</FieldLabel>
            <div className="relative">
                {prefix && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-700">{prefix}</span>}
                <input
                    id={fieldId}
                    data-testid={testId}
                    inputMode={mode}
                    autoComplete="off"
                    autoFocus={autoFocus}
                    placeholder={placeholder}
                    value={text}
                    aria-invalid={error || undefined}
                    aria-describedby={[hint ? hintId : '', showError ? errId : ''].filter(Boolean).join(' ') || undefined}
                    onBlur={onBlur}
                    onChange={(e) => {
                        const clean = cleanNumber(e.target.value, mode === 'decimal');
                        setText(clean);
                        onChange(parseFloat(clean) || 0);
                    }}
                    className={cn(
                        T.input, T.money, 'h-12 w-full text-lg font-bold',
                        prefix ? 'pl-8 pr-3' : 'px-3',
                        suffix && 'pr-9',
                        error && 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-500/30',
                    )}
                />
                {suffix && <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-700">{suffix}</span>}
            </div>
            {hint && <FieldDescription id={hintId} className="text-xs font-medium text-slate-700">{hint}</FieldDescription>}
            {showError && <FieldError id={errId} className="text-xs font-bold text-red-700">{errorText}</FieldError>}
        </Field>
    );
}
