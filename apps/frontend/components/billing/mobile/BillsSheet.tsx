'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBillingStore } from '@/store/billingStore';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import type { DraftBill } from '@/types';
import { SheetShell } from './SheetShell';
import { T } from './theme';

/** The store never lets more than this many bills be open (createDraft refuses the 11th). */
export const MAX_OPEN_BILLS = 10;

/** Drafts oldest first, the same order the desktop tab strip uses, so "Bill 2" means the same bill on every screen. */
export function sortedDrafts(drafts: Record<string, DraftBill>): DraftBill[] {
    return Object.values(drafts).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Label of a bill as the desktop tabs show it: the source invoice / quotation number, else "Bill N". */
export function draftLabel(draft: DraftBill, index: number): string {
    return draft.sourceInvoiceNo || draft.sourceQuotationNo || `Bill ${index + 1}`;
}

/** Customer name on a bill; a non-valued customer shows their name, a counter bill "Walk-in". */
export function draftCustomerName(draft: DraftBill): string {
    const name = draft.customer?.name || draft.customerLedger?.name || draft.walkInName;
    return name ? name.replace(/\s*\(\d{8,}\)\s*$/, '') : 'Walk-in';
}

function SaveStatus({ status }: { status: DraftBill['saveStatus'] }) {
    if (status === 'saving') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving</span>;
    if (status === 'saved') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Saved</span>;
    if (status === 'error') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-800"><AlertCircle className="h-3.5 w-3.5" aria-hidden /> Save failed</span>;
    if (status === 'offline') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><WifiOff className="h-3.5 w-3.5" aria-hidden /> Offline</span>;
    return <span className="text-xs font-semibold text-slate-700">Not saved yet</span>;
}

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Phone replacement for the desktop tab strip: every open bill (max 10) with its customer, amount and save status.
 * Tap a bill to switch to it, `New bill` opens an empty one, the X closes one (asking first when it has items).
 */
export function BillsSheet({ open, onClose }: Props) {
    const drafts = useBillingStore((s) => s.drafts);
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const getDraftTotals = useBillingStore((s) => s.getDraftTotals);
    const switchDraft = useBillingStore((s) => s.switchDraft);
    const createDraft = useBillingStore((s) => s.createDraft);
    const closeDraft = useBillingStore((s) => s.closeDraft);

    // The "are you sure" step is a second view inside this same sheet (swapping one sheet for another fights the Back-button history)
    const [confirmId, setConfirmId] = useState<string | null>(null);
    useEffect(() => { if (!open) setConfirmId(null); }, [open]);

    const list = sortedDrafts(drafts);
    const atLimit = list.length >= MAX_OPEN_BILLS;
    const confirmDraft = confirmId ? drafts[confirmId] : null;

    const remove = (id: string) => {
        const draft = drafts[id];
        if (draft && draft.cart.length > 0) setConfirmId(id);
        else closeDraft(id);
    };

    if (confirmDraft) {
        const label = draftLabel(confirmDraft, list.findIndex((d) => d.id === confirmDraft.id));
        return (
            <SheetShell
                open={open}
                onClose={onClose}
                title="Close this bill?"
                description={`${label} has ${confirmDraft.cart.length} item${confirmDraft.cart.length === 1 ? '' : 's'} (${formatCurrency(getDraftTotals(confirmDraft.id).grandTotal)}). They will be discarded.`}
                footer={
                    <div className="flex flex-col gap-2">
                        <Button variant="outline" className={'h-12 w-full rounded-xl border-2 border-red-600 bg-white text-base font-bold text-red-700 hover:bg-red-50 hover:text-red-800 active:bg-red-50'} onClick={() => { closeDraft(confirmDraft.id); setConfirmId(null); }}>Close bill</Button>
                        <Button variant="outline" className={cn(T.btn, 'h-12 w-full text-base')} onClick={() => setConfirmId(null)}>Keep bill</Button>
                    </div>
                }
            >
                <p className="text-sm text-slate-900">Closing removes this bill from this phone. Bills that were never saved cannot be brought back.</p>
            </SheetShell>
        );
    }

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title="Open bills"
            description={`${list.length} of ${MAX_OPEN_BILLS} bills open`}
            footer={
                <div className="space-y-2">
                    {atLimit && (
                        <p role="alert" className="rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
                            You already have {MAX_OPEN_BILLS} bills open. Close one to start another.
                        </p>
                    )}
                    <Button
                        className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')}
                        disabled={atLimit}
                        onClick={() => { if (!atLimit && createDraft()) onClose(); }}
                    >
                        <Plus className="h-4 w-4" aria-hidden /> New bill
                    </Button>
                </div>
            }
        >
            <ul className="space-y-2" aria-label="Open bills">
                {list.map((draft, index) => {
                    const active = draft.id === activeDraftId;
                    const label = draftLabel(draft, index);
                    const total = getDraftTotals(draft.id).grandTotal;
                    return (
                        <li key={draft.id} className="flex items-stretch gap-2" data-testid="bill-row">
                            <button
                                type="button"
                                aria-current={active ? 'true' : undefined}
                                onClick={() => { switchDraft(draft.id); onClose(); }}
                                className={cn(
                                    'flex min-h-14 min-w-0 flex-1 touch-manipulation items-center justify-between gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors',
                                    active ? T.selected : 'border-slate-300 bg-white shadow-sm active:bg-slate-100',
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <span className="truncate text-sm font-bold text-slate-900">{label}</span>
                                        {active && <span className="shrink-0 rounded bg-sky-700 px-1.5 py-0.5 text-xs font-bold text-white">Current</span>}
                                    </span>
                                    <span className="block truncate text-xs font-medium text-slate-600">{draftCustomerName(draft)} · {draft.cart.length} item{draft.cart.length === 1 ? '' : 's'}</span>
                                    <SaveStatus status={draft.saveStatus} />
                                </span>
                                <span className={cn(T.money, 'shrink-0 text-sm font-bold text-slate-900')}>{formatCurrency(total)}</span>
                            </button>
                            {list.length > 1 && (
                                <button
                                    type="button"
                                    aria-label={`Close ${label}`}
                                    onClick={() => remove(draft.id)}
                                    className="flex h-auto min-h-14 w-12 shrink-0 items-center justify-center touch-manipulation rounded-xl border border-slate-300 bg-white text-slate-700 active:bg-slate-100"
                                >
                                    <X className="h-5 w-5" aria-hidden />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </SheetShell>
    );
}
