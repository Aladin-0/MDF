'use client';

import { useState } from 'react';
import { ChevronDown, FileText, Stethoscope, User, UserRound, UserX } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isControlledSchedule } from '@/lib/scheduleRules';
import { cn } from '@/lib/utils';
import type { DraftBill } from '@/types';
import { T } from './theme';
import { BillingForSheet, billingForState } from './BillingForSheet';
import { CustomerSheet, cleanLedgerName } from './CustomerSheet';
import { DoctorSheet } from './DoctorSheet';
import { MoreDetailsSheet } from './MoreDetailsSheet';

type SheetName = 'customer' | 'billingFor' | 'doctor' | 'more';

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * True when the cart holds a controlled drug (G, H, H1, X, C, Narcotic: the same list the server enforces, lib/scheduleRules)
 * and the details the checkout asks for are not there yet. Same rule as useCheckout's isScheduleHValid:
 * complete Schedule H data, OR a customer with an address plus a doctor with a registration number.
 */
export function scheduleHDetailsMissing(draft: DraftBill): boolean {
    if (!draft.cart.some((item) => isControlledSchedule(item.scheduleType))) return false;
    const d = draft.scheduleHData;
    const explicit = Boolean(d && d.patientName?.trim() && d.patientAddress?.trim() && d.doctorName?.trim() && d.doctorRegNo?.trim());
    const fromScreen = Boolean(
        draft.customer && draft.customer.id !== 'mock' && draft.customer.address?.trim()
        && draft.doctor && draft.doctor.id !== 'mock' && draft.doctor.regNo?.trim(),
    );
    return !(explicit || fromScreen);
}

interface ChipProps {
    label: string;
    onClick?: () => void;
    tone?: 'default' | 'filled' | 'warn';
    children: React.ReactNode;
    badge?: React.ReactNode;
    testId?: string;
}

/** A 44px+ chip: a visible caption above the value, the value (or "+ Add") below. Without onClick it is a read-only chip. */
function Chip({ label, onClick, tone = 'default', children, badge, testId }: ChipProps) {
    const className = cn(
        'relative flex min-h-11 max-w-[260px] shrink-0 touch-manipulation items-center gap-2 rounded-xl border-2 px-3 py-1 text-left',
        tone === 'filled' && 'border-sky-500 bg-sky-50',
        tone === 'warn' && 'border-amber-500 bg-amber-100',
        tone === 'default' && 'border-slate-300 bg-white',
        onClick && 'active:bg-slate-100',
    );
    const body = (
        <>
            <span className="min-w-0">
                <span className={cn(T.label, 'block leading-4')}>{label}</span>
                <span className="block truncate text-sm font-bold leading-5 text-slate-900">{children}</span>
            </span>
            {badge}
            {onClick && <ChevronDown className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />}
        </>
    );
    return onClick
        ? <button type="button" onClick={onClick} data-testid={testId} className={className}>{body}</button>
        : <div data-testid={testId} className={className}>{body}</div>;
}

const AddText = ({ children = '+ Add' }: { children?: string }) => <span className="font-bold text-sky-700">{children}</span>;

const pill = 'shrink-0 rounded border px-1.5 py-0.5 text-xs font-bold tabular-nums';

/**
 * The row of chips under the top bar: Customer, Billing for (retail, once a customer is chosen), Doctor (retail), More.
 * Every chip shows its value or "+ Add" and opens its own bottom sheet (rendered here). The row scrolls sideways on its own.
 */
export function PartyChips() {
    const draft = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId] : null));
    const enableEwayBill = useSettingsStore((s) => s.enableEwayBill);
    const [sheet, setSheet] = useState<SheetName | null>(null);
    const close = () => setSheet(null);

    if (!draft) return null;
    const wholesale = draft.saleType === 'WHOLESALE';
    const { customerLedger: ledger, customer, patient, doctor, walkInName } = draft;
    const isMock = !!(ledger && (ledger as any).isMock);

    // ---- Customer chip
    let customerValue: React.ReactNode;
    let customerTone: ChipProps['tone'] = 'default';
    if (ledger) {
        customerValue = cleanLedgerName(ledger.name);
        customerTone = 'filled';
    } else if (walkInName) {
        customerValue = <>{walkInName} <span className="font-semibold text-slate-700">· Walk-in</span></>;
        customerTone = 'filled';
    } else if (wholesale) {
        customerValue = <AddText>+ Add customer</AddText>;      // wholesale needs a named customer
        customerTone = 'warn';
    } else {
        customerValue = <>Walk-in <AddText>+ Add</AddText></>;
    }

    const showDue = !wholesale && ledger && !isMock && (Number(ledger.currentBalance) > 0 || Number((customer as any)?.creditLimit) > 0);
    const customerBadges = (
        <>
            {showDue && Number(ledger!.currentBalance) > 0 && <span className={cn(pill, 'border-red-300 bg-red-100 text-red-800')}>Due {inr(ledger!.currentBalance)}</span>}
            {showDue && Number((customer as any)?.creditLimit) > 0 && <span className={cn(pill, 'border-emerald-300 bg-emerald-100 text-emerald-800')}>Limit {inr((customer as any).creditLimit)}</span>}
            {wholesale && customer && (
                <>
                    <span className={cn(pill, 'border-slate-300 bg-slate-100 text-slate-800')}>DL {customer.dlNo20b || customer.dlNo21b || 'N/A'}</span>
                    <span className={cn(pill, 'border-emerald-300 bg-emerald-100 text-emerald-800')}>Limit {inr(customer.creditLimit || 0)}</span>
                    <span className={cn(pill, (customer.outstanding || 0) > 0 ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-300 bg-slate-100 text-slate-800')}>Out {inr(customer.outstanding || 0)}</span>
                </>
            )}
        </>
    );

    // ---- Billing for chip (retail, only with a customer record)
    const showBillingFor = !wholesale && !!ledger && (isMock || !!(ledger as any).linkedCustomerId);
    let billingForValue: React.ReactNode = 'Self';
    let billingForTone: ChipProps['tone'] = 'filled';
    if (showBillingFor && ledger && !isMock) {
        const state = billingForState(ledger, patient);
        if (state.needsChoice) { billingForValue = 'Select who'; billingForTone = 'warn'; }
        else billingForValue = !state.selected || state.selected.isAccountHolder ? 'Self' : cleanLedgerName(state.selected.name);
    } else if (isMock) {
        billingForValue = cleanLedgerName(patient?.name ?? 'Self');
    }

    // ---- Doctor chip (retail)
    const needsScheduleH = !wholesale && scheduleHDetailsMissing(draft);

    // ---- More chip
    const more: string[] = [];
    if (!wholesale) {
        if (draft.hospitalName) more.push(draft.hospitalName);
        if (draft.prescriptionNo) more.push(`Rx ${draft.prescriptionNo}`);
        if (draft.prescriptionImageUrl) more.push('Photo');
    } else if (enableEwayBill) {
        if (draft.transporterId) more.push('Transporter');
        if (draft.vehicleNo) more.push(draft.vehicleNo);
    }
    const hasMoreFields = !wholesale || enableEwayBill || draft.documentMode === 'invoice';

    return (
        <>
            <div role="group" aria-label="Bill details" className="no-scrollbar flex gap-2 overflow-x-auto border-b border-slate-300 bg-white px-3 py-2">
                <Chip
                    label="Customer" testId="chip-customer" onClick={() => setSheet('customer')}
                    tone={customerTone} badge={customerBadges}
                >
                    {walkInName && !ledger ? <UserX className="mr-1 inline h-4 w-4 text-slate-700" aria-hidden /> : <User className="mr-1 inline h-4 w-4 text-slate-700" aria-hidden />}
                    {customerValue}
                </Chip>

                {showBillingFor && (
                    <Chip
                        label="Billing for" testId={isMock ? 'billing-for' : 'chip-billing-for'}
                        onClick={isMock ? undefined : () => setSheet('billingFor')}
                        tone={billingForTone}
                    >
                        <UserRound className="mr-1 inline h-4 w-4 text-slate-700" aria-hidden />{billingForValue}
                    </Chip>
                )}

                {!wholesale && (
                    <Chip
                        label="Doctor" testId="chip-doctor" onClick={() => setSheet('doctor')}
                        tone={doctor ? 'filled' : 'default'}
                        badge={needsScheduleH && (
                            <span data-testid="schedule-h-dot" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">
                                <span className="h-2 w-2 rounded-full bg-white" aria-hidden /> Sch. H<span className="sr-only"> details needed</span>
                            </span>
                        )}
                    >
                        <Stethoscope className="mr-1 inline h-4 w-4 text-slate-700" aria-hidden />
                        {doctor ? doctor.name : <AddText />}
                    </Chip>
                )}

                {hasMoreFields && (
                    <Chip
                        label="More" testId="chip-more" onClick={() => setSheet('more')}
                        tone={more.length ? 'filled' : 'default'}
                    >
                        {more.length
                            ? <><FileText className="mr-1 inline h-4 w-4 text-slate-700" aria-hidden />{more.join(' · ')}</>
                            : <AddText />}
                    </Chip>
                )}
            </div>

            <CustomerSheet open={sheet === 'customer'} onClose={close} />
            <BillingForSheet open={sheet === 'billingFor'} onClose={close} />
            <DoctorSheet open={sheet === 'doctor'} onClose={close} />
            <MoreDetailsSheet open={sheet === 'more'} onClose={close} />
        </>
    );
}
