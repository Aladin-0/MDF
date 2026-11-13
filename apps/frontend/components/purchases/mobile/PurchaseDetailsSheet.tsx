'use client';

import { cn } from '@/lib/utils';
import { SheetShell } from '@/components/billing/mobile/SheetShell';
import { T } from '@/components/billing/mobile/theme';
import { GODOWNS, defaultDueStr } from '@/lib/purchaseEntry';
import type { PurchaseEntry } from '@/hooks/usePurchaseEntry';

const CREDIT_DAYS = [7, 15, 30, 45, 60, 90];

interface PurchaseDetailsSheetProps {
    entry: PurchaseEntry;
    open: boolean;
    onClose: () => void;
}

/** The rarely changed header fields: credit or cash, credit days, godown, PO reference, notes. */
export function PurchaseDetailsSheet({ entry, open, onClose }: PurchaseDetailsSheetProps) {
    const { watch, setValue, watchedPurchaseType, creditDays, setCreditDays, linkedPo } = entry;
    const godown = watch('godown') || 'main';
    const days = Array.from(new Set([...CREDIT_DAYS, creditDays])).sort((a, b) => a - b);
    const seg = (active: boolean) => cn('min-h-[48px] flex-1 touch-manipulation rounded-lg border-2 px-3 text-base font-extrabold', active ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-400 bg-white text-slate-900 active:bg-slate-100');
    const selectCls = cn(T.input, 'h-12 w-full px-3 text-base font-semibold');
    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Purchase details"
            footer={<button type="button" data-testid="details-done" onClick={onClose} className={cn(T.cta, 'h-12 w-full text-base')}>Done</button>}
            bodyClassName="space-y-4"
        >
            <div>
                <span className={cn(T.label, 'mb-1 block')} id="pd-type">Purchase Type</span>
                <div role="radiogroup" aria-labelledby="pd-type" className="flex gap-2">
                    {(['credit', 'cash'] as const).map((t) => (
                        <button key={t} type="button" role="radio" aria-checked={watchedPurchaseType === t} data-testid={`type-${t}`}
                            onClick={() => { setValue('purchaseType', t, { shouldDirty: true }); setValue('dueDate', t === 'cash' ? undefined : defaultDueStr()); }}
                            className={seg(watchedPurchaseType === t)}>
                            {t === 'credit' ? 'Credit' : 'Cash'}
                        </button>
                    ))}
                </div>
            </div>

            {watchedPurchaseType !== 'cash' && (
                <div>
                    <label htmlFor="pd-days" className={cn(T.label, 'mb-1 block')}>Credit Days</label>
                    <select id="pd-days" data-testid="credit-days" value={creditDays} onChange={(e) => setCreditDays(parseInt(e.target.value, 10) || 30)} className={selectCls}>
                        {days.map((d) => <option key={d} value={d}>{d} days</option>)}
                    </select>
                </div>
            )}

            <div>
                <label htmlFor="pd-godown" className={cn(T.label, 'mb-1 block')}>Godown</label>
                <select id="pd-godown" data-testid="godown" value={godown} onChange={(e) => setValue('godown', e.target.value, { shouldDirty: true })} className={selectCls}>
                    {GODOWNS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
            </div>

            <div>
                <label htmlFor="pd-po" className={cn(T.label, 'mb-1 block')}>PO Ref</label>
                <input id="pd-po" data-testid="po-ref" autoComplete="off" value={watch('purchaseOrderRef') ?? ''} disabled={!!linkedPo}
                    onChange={(e) => setValue('purchaseOrderRef', e.target.value, { shouldDirty: true })} placeholder="Optional" className={cn(T.input, 'h-12 w-full px-3 text-base font-semibold disabled:bg-slate-100')} />
                {linkedPo && <p className="mt-1 text-xs font-medium text-slate-700">Linked to {linkedPo.poNumber}. Unlink it on the purchase screen to change this.</p>}
            </div>

            <div>
                <label htmlFor="pd-notes" className={cn(T.label, 'mb-1 block')}>Notes</label>
                <textarea id="pd-notes" data-testid="notes" rows={3} value={watch('notes') ?? ''} onChange={(e) => setValue('notes', e.target.value, { shouldDirty: true })} placeholder="Optional notes…" className={cn(T.input, 'w-full px-3 py-2 text-base')} />
            </div>
        </SheetShell>
    );
}
