'use client';

import { cn } from '@/lib/utils';
import { SheetShell } from '@/components/billing/mobile/SheetShell';
import { T } from '@/components/billing/mobile/theme';
import { REVISION_REASONS, REVISION_TEXT_MIN } from '@/lib/purchaseEntry';

interface PurchaseRevisionSheetProps {
    open: boolean;
    onClose: () => void;
    code: string;
    text: string;
    onCode: (c: string) => void;
    onText: (t: string) => void;
    onConfirm: () => void;
    saving?: boolean;
}

/** Changing a saved purchase needs a reason (kept in the audit log): a code and a short explanation. */
export function PurchaseRevisionSheet({ open, onClose, code, text, onCode, onText, onConfirm, saving }: PurchaseRevisionSheetProps) {
    const ready = !!code && text.trim().length >= REVISION_TEXT_MIN;
    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Reason for the change"
            description="Recorded in the audit log with this change"
            bodyClassName="space-y-4"
            footer={
                <div className="space-y-2">
                    <button type="button" data-testid="revision-confirm" disabled={!ready || saving} onClick={onConfirm} className={cn(T.cta, 'h-12 w-full text-base')}>{saving ? 'Saving…' : 'Save changes'}</button>
                    <button type="button" onClick={onClose} className={cn(T.btn, 'h-12 w-full text-base')}>Cancel</button>
                </div>
            }
        >
            <div>
                <label htmlFor="rv-code" className={cn(T.label, 'mb-1 block')}>Reason <span className="text-red-600">*</span></label>
                <select id="rv-code" data-testid="revision-code" value={code} onChange={(e) => onCode(e.target.value)} className={cn(T.input, 'h-12 w-full px-3 text-base font-semibold')}>
                    <option value="">Select a reason…</option>
                    {REVISION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="rv-text" className={cn(T.label, 'mb-1 block')}>Explanation <span className="text-red-600">*</span></label>
                <textarea id="rv-text" data-testid="revision-text" rows={4} value={text} onChange={(e) => onText(e.target.value)} placeholder="Why is this purchase being changed?" className={cn(T.input, 'w-full px-3 py-2 text-base')} />
                <p className={cn('mt-1 text-xs font-medium', text.trim().length >= REVISION_TEXT_MIN ? 'text-emerald-800' : 'text-slate-700')}>At least {REVISION_TEXT_MIN} characters ({text.trim().length} so far)</p>
            </div>
        </SheetShell>
    );
}
