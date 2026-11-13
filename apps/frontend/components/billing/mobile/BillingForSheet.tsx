'use client';

import { useEffect, useState } from 'react';
import { Check, Lock, Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddFamilyMemberDialog } from '@/components/billing/AddFamilyMemberDialog';
import { useOutletId } from '@/hooks/useOutletId';
import { useBillingStore } from '@/store/billingStore';
import { cn } from '@/lib/utils';
import type { FamilyMember, Ledger } from '@/types';
import { SheetShell } from './SheetShell';
import { T } from './theme';

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const clean = (name: string) => name.replace(/\s*\(\d{8,}\)\s*$/, '');          // ledgers are named "Name (mobile)"

/**
 * Who a bill is for, worked out from the customer's ledger exactly as the desktop BillingFor does.
 * `needsChoice` = a purely shared family record (no "Self"): the cashier must pick a person.
 */
export function billingForState(ledger: Ledger, patient: FamilyMember | null | undefined) {
    const ownerId = (ledger as any).linkedCustomerId as string;
    const listed = ledger.familyMembers ?? [];
    const sharedRecord = !!ledger.isFamilyAccount && listed.length > 0 && !listed.some((m) => m.isAccountHolder);
    const self: FamilyMember = listed.find((m) => m.isAccountHolder) ?? { id: ownerId, name: clean(ledger.name), phone: ledger.phone, isAccountHolder: true };
    const options: FamilyMember[] = sharedRecord ? listed : [self, ...listed.filter((m) => !m.isAccountHolder)];
    const selected: FamilyMember | null = patient && patient.id !== self.id ? patient : (sharedRecord ? null : self);
    return { options, selected, self, sharedRecord, needsChoice: sharedRecord && !patient };
}

const relationOf = (m: FamilyMember) => (m.isAccountHolder ? 'Self' : m.relationship || '');

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Retail only. Self + each family member as large radio rows; picking a person bills the customer's ONE account and names that
 * person as the patient (family money is never re-keyed onto members). Read-only while a saved bill is edited or repeated.
 */
export function BillingForSheet({ open, onClose }: Props) {
    const outletId = useOutletId();
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const draft = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId] : null));
    const setPatient = useBillingStore((s) => s.setPatient);
    const updateDraftHeader = useBillingStore((s) => s.updateDraftHeader);
    const [adding, setAdding] = useState(false);
    useEffect(() => { if (!open) setAdding(false); }, [open]);

    if (!activeDraftId || !draft) return null;
    const ledger = draft.customerLedger;
    const patient = draft.patient;

    // ---- read-only: a saved bill being edited / repeated keeps its person (the ledger is a stand-in, not a live account)
    if (ledger && (ledger as any).isMock) {
        return (
            <SheetShell open={open} onClose={onClose} title="Billing for" footer={<Button variant="outline" className={cn(T.btn, 'h-12 w-full text-base')} onClick={onClose}>Close</Button>}>
                <div data-testid="billing-for" className={cn(T.selected, 'flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2')}>
                    <Lock className="h-5 w-5 shrink-0 text-sky-700" aria-hidden />
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{patient?.name ?? 'Self'}</span>
                        <span className="block text-xs font-medium text-slate-600">Fixed while you edit or repeat a saved bill.</span>
                    </span>
                </div>
            </SheetShell>
        );
    }

    if (!ledger || !(ledger as any).linkedCustomerId) {
        return (
            <SheetShell open={open} onClose={onClose} title="Billing for" footer={<Button variant="outline" className={cn(T.btn, 'h-12 w-full text-base')} onClick={onClose}>Close</Button>}>
                <p data-testid="billing-for" className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900">Select a customer first.</p>
            </SheetShell>
        );
    }

    const { options, selected, needsChoice } = billingForState(ledger, patient);
    const showMoney = Number(ledger.currentBalance) > 0 || Number((draft.customer as any)?.creditLimit) > 0;
    const familySize = options.length;

    const choose = (m: FamilyMember) => { setPatient(m.isAccountHolder ? null : m); onClose(); };

    return (
        <>
            <SheetShell
                open={open && !adding}
                onClose={onClose}
                title="Billing for"
                description={`Who is this bill for? It is billed to ${clean(ledger.name)}'s account.`}
                footer={
                    <Button variant="outline" className={cn(T.ctaOutline, 'h-12 w-full text-base hover:bg-sky-50 hover:text-sky-700')} onClick={() => setAdding(true)}>
                        <Plus className="h-4 w-4" aria-hidden /> Add family member
                    </Button>
                }
            >
                <div data-testid="billing-for" className="space-y-3">
                    {needsChoice && (
                        <p role="alert" className="flex items-start gap-2 rounded-lg border-2 border-amber-500 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Select who this bill is for
                        </p>
                    )}

                    {(showMoney || familySize > 1) && (
                        <div data-testid="family-account-money" className="flex flex-wrap items-center gap-2">
                            {familySize > 1 && <span className="rounded border border-indigo-300 bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-800">Family · {familySize} people</span>}
                            {Number(ledger.currentBalance) > 0 && (
                                <span className="rounded border border-red-300 bg-red-100 px-2 py-1 text-xs font-bold tabular-nums text-red-800">Shared due {inr(ledger.currentBalance)}</span>
                            )}
                            {Number((draft.customer as any)?.creditLimit) > 0 && (
                                <span className="rounded border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-bold tabular-nums text-emerald-800">Shared limit {inr((draft.customer as any).creditLimit)}</span>
                            )}
                        </div>
                    )}

                    <div role="radiogroup" aria-label="Billing for" className="space-y-2">
                        {options.map((m) => {
                            const active = selected?.id === m.id;
                            return (
                                <button
                                    key={m.id} type="button" role="radio" aria-checked={active}
                                    onClick={() => choose(m)}
                                    className={cn(
                                        'flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors',
                                        active ? T.selected : 'border-slate-300 bg-white shadow-sm active:bg-slate-100',
                                    )}
                                >
                                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-500')}>
                                        {active && <Check className="h-4 w-4" aria-hidden />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-slate-900">{clean(m.name)}</span>
                                        <span className="block truncate text-xs font-medium text-slate-600">{m.phone || ledger.phone || 'No mobile'}{m.age != null ? ` · ${m.age} yrs` : ''}</span>
                                    </span>
                                    <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">{relationOf(m) || 'Member'}</span>
                                    {active && <span className="sr-only">Selected</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </SheetShell>

            {outletId && (
                <AddFamilyMemberDialog
                    open={open && adding}
                    onClose={() => setAdding(false)}
                    outletId={outletId}
                    ownerId={(ledger as any).linkedCustomerId}
                    ownerName={clean(ledger.name)}
                    ownerPhone={ledger.phone || ''}
                    onAdded={(member) => {
                        // the first person added turns a plain customer into a family: list the owner too, then select the new person
                        const owner: FamilyMember = {
                            id: (ledger as any).linkedCustomerId, name: clean(ledger.name),
                            isAccountHolder: true, relationship: 'Account holder', phone: ledger.phone,
                        };
                        const existing = ledger.familyMembers?.length ? ledger.familyMembers : [owner];
                        updateDraftHeader(activeDraftId, {
                            customerLedger: { ...ledger, isFamilyAccount: true, familyMembers: [...existing, member] },
                            patient: member,
                        });
                        setAdding(false);
                        onClose();
                    }}
                />
            )}
        </>
    );
}
