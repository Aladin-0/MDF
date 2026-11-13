'use client';

import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { LedgerPicker, formatLedgerBalance, getBalBadgeColor } from '@/components/accounts/LedgerPicker';
import { cn } from '@/lib/utils';
import { T } from '@/components/billing/mobile/theme';
import { GODOWNS } from '@/lib/purchaseEntry';
import type { PurchaseEntry } from '@/hooks/usePurchaseEntry';

/** "Credit · 30 days · Main Store" — what the More details sheet currently says, shown on its button */
export function describeDetails(type: string, creditDays: number, godown: string | undefined, poRef?: string): string {
    const parts = [type === 'cash' ? 'Cash' : `Credit · ${creditDays} days`, GODOWNS.find((g) => g.value === (godown || 'main'))?.label ?? 'Main Store'];
    if (poRef) parts.push(`PO ${poRef}`);
    return parts.join(' · ');
}

interface PurchaseHeaderCardProps {
    entry: PurchaseEntry;
    onOpenDetails: () => void;
    /** Lets the Save bar focus the party / invoice box */
    partyBoxRef?: React.RefObject<HTMLDivElement>;
    invoiceInputRef?: React.RefObject<HTMLInputElement>;
}

/** Party, invoice number and date on one compact card, plus one button for everything else (credit, godown, PO, notes). */
export function PurchaseHeaderCard({ entry, onOpenDetails, partyBoxRef, invoiceInputRef }: PurchaseHeaderCardProps) {
    const { partyLedger, setPartyLedger, setValue, watch, errors, isDuplicate, watchedPurchaseType, creditDays } = entry;
    const invoiceNo = watch('invoiceNo') ?? '';
    const invoiceDate = watch('invoiceDate') ?? '';
    const invoiceError = errors.invoiceNo?.message || (isDuplicate ? 'This invoice number is already entered for this party' : '');
    return (
        <section aria-label="Invoice details" className={cn(T.card, 'space-y-3 p-3')}>
            <div className="min-w-0" ref={partyBoxRef}>
                <span className={cn(T.label, 'mb-1 block')}>Party <span className="text-red-600">*</span></span>
                {partyLedger ? (
                    // the picker's own "selected" row squeezes the name to "A…" on a phone, so the chosen party is shown here in full
                    <div data-testid="party-selected" className="flex items-start gap-2 rounded-lg border-2 border-slate-400 bg-white px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <p data-testid="party-name" className="break-words text-base font-extrabold leading-snug text-slate-900">{partyLedger.name}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                {partyLedger.groupName && <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-800">{partyLedger.groupName}</span>}
                                <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono font-semibold', getBalBadgeColor(partyLedger.currentBalance, partyLedger.nature))}>
                                    <span className="font-sans text-[11px] font-normal uppercase tracking-wide">Bal:</span>{formatLedgerBalance(partyLedger.currentBalance, partyLedger.nature)}
                                </span>
                            </p>
                        </div>
                        <button type="button" data-testid="party-change" onClick={() => { setPartyLedger(null); setValue('partyLedgerId', '', { shouldValidate: true, shouldDirty: true }); }}
                            className="min-h-[44px] shrink-0 rounded-lg border-2 border-slate-400 px-3 text-sm font-bold text-slate-900 active:bg-slate-100">Change</button>
                    </div>
                ) : (
                <LedgerPicker
                    group="Sundry Creditors"
                    value={partyLedger}
                    onChange={(l) => { setPartyLedger(l); setValue('partyLedgerId', l?.id ?? '', { shouldValidate: true, shouldDirty: true }); }}
                    placeholder="Select the distributor…"
                    className={cn('h-12 text-base [&_input]:h-12', errors.partyLedgerId && 'rounded-md ring-2 ring-red-500')}
                />
                )}
                {errors.partyLedgerId && <p role="alert" className="mt-1 text-sm font-bold text-red-700">{errors.partyLedgerId.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                    <label htmlFor="pp-invoice-no" className={cn(T.label, 'mb-1 block')}>Invoice No <span className="text-red-600">*</span></label>
                    <input
                        id="pp-invoice-no"
                        ref={invoiceInputRef}
                        data-testid="invoice-no"
                        autoComplete="off"
                        spellCheck={false}
                        autoCapitalize="characters"
                        value={invoiceNo}
                        onChange={(e) => setValue('invoiceNo', e.target.value, { shouldDirty: true, shouldValidate: !!errors.invoiceNo })}
                        placeholder="e.g. AJD-0123"
                        aria-invalid={!!invoiceError || undefined}
                        className={cn(T.input, 'h-12 w-full px-3 text-base font-bold', invoiceError && 'border-red-500 bg-red-50')}
                    />
                </div>
                <div className="min-w-0">
                    <label htmlFor="pp-invoice-date" className={cn(T.label, 'mb-1 block')}>Invoice Date</label>
                    <input
                        id="pp-invoice-date"
                        data-testid="invoice-date"
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setValue('invoiceDate', e.target.value, { shouldDirty: true })}
                        className={cn(T.input, 'h-12 w-full min-w-0 px-2 text-base font-semibold')}
                    />
                </div>
            </div>
            {invoiceError && <p role="alert" data-testid="invoice-error" className="-mt-1 text-sm font-bold text-red-700">{invoiceError}</p>}

            <button
                type="button"
                data-testid="open-details"
                onClick={onOpenDetails}
                className={cn(T.btn, 'flex min-h-[48px] w-full touch-manipulation items-center gap-2 px-3 py-1.5 text-left text-sm')}
            >
                <SlidersHorizontal className="h-5 w-5 shrink-0 text-slate-700" aria-hidden />
                <span className="min-w-0 flex-1 break-words leading-snug" data-testid="details-summary">{describeDetails(watchedPurchaseType, creditDays, watch('godown'), watch('purchaseOrderRef'))}</span>
                <span className="shrink-0 text-xs font-bold text-sky-700">More details</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-700" aria-hidden />
            </button>
        </section>
    );
}
