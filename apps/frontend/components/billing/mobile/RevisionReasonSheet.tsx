'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SheetShell } from './SheetShell';
import { T } from './theme';

// Same codes as the desktop RevisionReasonModal (the server stores them in the audit log)
export const REVISION_REASON_CODES = [
    { value: 'CUSTOMER_REQUEST', label: 'Customer request' },
    { value: 'ENTRY_ERROR_RATE', label: 'Entry error: rate / discount' },
    { value: 'ENTRY_ERROR_QTY', label: 'Entry error: quantity' },
    { value: 'ENTRY_ERROR_ITEM', label: 'Entry error: wrong item' },
    { value: 'DOCTOR_CHANGE', label: 'Doctor / header change' },
    { value: 'OTHER', label: 'Other' },
] as const;

interface RevisionReasonSheetProps {
    open: boolean;
    onClose: () => void;
    /** Same contract as RevisionReasonModal.onSubmit: the caller stores the reason on the draft and runs the checkout. */
    onSubmit: (reasonCode: string, reasonText: string) => void;
}

/** Phone version of RevisionReasonModal: a bottom sheet with large radio rows and inline validation (no alert()). */
export function RevisionReasonSheet({ open, onClose, onSubmit }: RevisionReasonSheetProps) {
    const [code, setCode] = useState('');
    const [text, setText] = useState('');
    const [tried, setTried] = useState(false);

    useEffect(() => {
        if (open) { setCode(''); setText(''); setTried(false); }
    }, [open]);

    const codeMissing = !code;
    const textMissing = !text.trim();

    const confirm = () => {
        setTried(true);
        if (codeMissing || textMissing) return;
        onSubmit(code, text.trim());
    };

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Reason for modification"
            description="Recorded in the audit log with this change."
            footer={
                <div className="flex flex-col gap-2">
                    <Button type="button" data-testid="revision-confirm" onClick={confirm} className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')}>Save changes</Button>
                    <Button type="button" variant="outline" onClick={onClose} className={cn(T.btn, 'h-11 w-full')}>Cancel</Button>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div>
                    <Label id="revision-code-label" className={T.label}>Reason code <span className="text-red-700">*</span></Label>
                    <div role="radiogroup" aria-labelledby="revision-code-label" className="mt-2 flex flex-col gap-2">
                        {REVISION_REASON_CODES.map((c) => {
                            const selected = code === c.value;
                            return (
                                <button
                                    key={c.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setCode(c.value)}
                                    className={cn(
                                        'flex min-h-[48px] w-full touch-manipulation items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-sm font-bold text-slate-900 transition-colors',
                                        selected ? T.selected : 'border-slate-300 bg-white shadow-sm active:bg-slate-100',
                                    )}
                                >
                                    {selected ? <CheckCircle2 className="h-5 w-5 shrink-0 text-sky-600" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />}
                                    <span>{c.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    {tried && codeMissing && (
                        <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm font-bold text-red-800"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden />Choose a reason code.</p>
                    )}
                </div>
                <div>
                    <Label htmlFor="revision-text" className={T.label}>Explanation <span className="text-red-700">*</span></Label>
                    <Textarea
                        id="revision-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Briefly explain why this bill is being changed…"
                        rows={3}
                        aria-invalid={tried && textMissing}
                        className={cn(T.input, 'mt-2 min-h-[96px] text-base', tried && textMissing && 'border-red-600')}
                    />
                    {tried && textMissing && (
                        <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm font-bold text-red-800"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden />Write a short explanation.</p>
                    )}
                </div>
            </div>
        </SheetShell>
    );
}
