'use client';

import { cn } from '@/lib/utils';
import { SheetShell } from '@/components/billing/mobile/SheetShell';
import { T } from '@/components/billing/mobile/theme';
import { NumField } from './NumField';
import { fmt } from '@/lib/purchaseEntry';
import type { PurchaseEntry } from '@/hooks/usePurchaseEntry';

function Row({ label, value, strong, minus, testId }: { label: string; value: number; strong?: boolean; minus?: boolean; testId?: string }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'border-t border-slate-300 pt-2 text-base font-extrabold')}>
            <dt className={cn('text-sm text-slate-700', strong && 'text-slate-900')}>{label}</dt>
            <dd data-testid={testId} className={cn('text-sm font-bold text-slate-900', T.money, strong && 'text-base')}>{minus && value > 0 ? '− ' : value < 0 ? '− ' : ''}{fmt(Math.abs(value))}</dd>
        </div>
    );
}

interface PurchaseTotalsSheetProps {
    entry: PurchaseEntry;
    open: boolean;
    onClose: () => void;
}

/** The whole bill: the breakdown, and the three adjustments that are not on a line (freight, invoice discount, ledger adjustment). */
export function PurchaseTotalsSheet({ entry, open, onClose }: PurchaseTotalsSheetProps) {
    const {
        watch, setValue, goodsValue, totalTradeDisc, totalCashDisc, invoiceDiscount, invoiceDiscountPct, taxableValue, totalGST, totalCess,
        cgst, sgst, igst, freight, roundOff, computedTotal, ledgerAdjustment, setLedgerAdjustment, adjustmentSign, setAdjustmentSign, ledgerNote, setLedgerNote,
        effectiveAdjustment, netPayable, totalUnits, isInterstate, watchedPurchaseType,
    } = entry;
    const seg = (active: boolean) => cn('min-h-[44px] flex-1 touch-manipulation rounded-lg border-2 px-2 text-sm font-extrabold', active ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-400 bg-white text-slate-900 active:bg-slate-100');
    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Purchase total"
            description={`${totalUnits.toLocaleString('en-IN')} units`}
            footer={<button type="button" data-testid="totals-done" onClick={onClose} className={cn(T.cta, 'h-12 w-full text-base')}>Done</button>}
            bodyClassName="space-y-4"
        >
            <div className={cn(T.dock, 'rounded-xl p-3')}>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Net payable</p>
                <p data-testid="totals-net" className={cn('text-4xl font-black leading-tight', T.money)}>{fmt(netPayable)}</p>
                {watchedPurchaseType === 'credit' && watch('dueDate') && <p className="mt-1 text-sm font-semibold text-slate-300">Due {watch('dueDate')}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <NumField label="Freight / transport" prefix="₹" value={Number(watch('freight')) || 0} onChange={(n) => setValue('freight', n, { shouldDirty: true })} testId="adj-freight" />
                <NumField label="Invoice discount" prefix="₹" value={Number(watch('invoiceDiscount')) || 0} onChange={(n) => setValue('invoiceDiscount', n, { shouldDirty: true })} testId="adj-discount" />
            </div>

            <div className={cn(T.card, 'space-y-3 p-3')}>
                <div>
                    <p className="text-sm font-extrabold text-slate-900">Ledger adjustment</p>
                    <p className="text-xs font-medium text-slate-700">Apply credit from the distributor's account (return, advance, write-off)</p>
                </div>
                <div role="radiogroup" aria-label="Adjustment type" className="flex gap-2">
                    <button type="button" role="radio" aria-checked={adjustmentSign === '-'} data-testid="adj-sign-minus" onClick={() => setAdjustmentSign('-')} className={seg(adjustmentSign === '-')}>− Subtract</button>
                    <button type="button" role="radio" aria-checked={adjustmentSign === '+'} data-testid="adj-sign-plus" onClick={() => setAdjustmentSign('+')} className={seg(adjustmentSign === '+')}>+ Add</button>
                </div>
                <NumField label="Amount" prefix="₹" value={ledgerAdjustment} onChange={setLedgerAdjustment} testId="adj-amount" />
                {ledgerAdjustment > 0 && (
                    <div>
                        <label htmlFor="adj-note" className={cn(T.label, 'mb-1 block')}>Reason</label>
                        <input id="adj-note" data-testid="adj-note" autoComplete="off" value={ledgerNote} onChange={(e) => setLedgerNote(e.target.value)} placeholder="e.g. Return CN-2024-45" className={cn(T.input, 'h-12 w-full px-3 text-base')} />
                    </div>
                )}
            </div>

            <dl className={cn(T.card, 'px-3 py-2')} data-testid="totals-breakdown">
                <Row label="Goods value" value={goodsValue} testId="t-goods" />
                {totalTradeDisc > 0 && <Row label="Trade discount" value={totalTradeDisc} minus />}
                {totalCashDisc > 0 && <Row label="Cash discount" value={totalCashDisc} minus />}
                {invoiceDiscount > 0 && <Row label={`Invoice discount (${(invoiceDiscountPct * 100).toFixed(2)}%)`} value={invoiceDiscount} minus />}
                <Row label="Taxable value" value={taxableValue} testId="t-taxable" />
                {isInterstate ? <Row label="IGST" value={igst} testId="t-igst" /> : (<><Row label="CGST" value={cgst} testId="t-cgst" /><Row label="SGST" value={sgst} testId="t-sgst" /></>)}
                {totalCess > 0 && <Row label="Cess" value={totalCess} />}
                {freight > 0 && <Row label="Freight" value={freight} />}
                {Math.abs(roundOff) >= 0.005 && <Row label="Round off" value={roundOff} />}
                <Row label="Invoice total" value={computedTotal} strong testId="t-total" />
                {ledgerAdjustment > 0 && <Row label={effectiveAdjustment > 0 ? 'Less: ledger adjustment' : 'Add: ledger adjustment'} value={Math.abs(effectiveAdjustment)} />}
                <Row label="Net payable" value={netPayable} strong testId="t-net" />
            </dl>
            <p className="text-xs font-medium text-slate-700">{isInterstate ? 'Interstate purchase: IGST applies.' : 'Same-state purchase: CGST + SGST apply.'}</p>
        </SheetShell>
    );
}
