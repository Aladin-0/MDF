'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Receipt, Search, UserX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NewCustomerModal } from '@/components/billing/NewCustomerModal';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi } from '@/lib/apiClient';
import { useBillingStore } from '@/store/billingStore';
import { cn } from '@/lib/utils';
import type { FamilyMember, Ledger } from '@/types';
import { SheetShell } from './SheetShell';
import { T } from './theme';

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
/** Ledgers are named "Name (mobile)"; the mobile is shown on its own, so drop it from the name. */
export const cleanLedgerName = (name: string) => name.replace(/\s*\(\d{8,}\)\s*$/, '');

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Customer picker bottom sheet. Same data calls and rules as the desktop header (LedgerPicker + BillingHeaderStrip):
 * Sundry Debtors, 300ms debounce, limit 50, a family found by a member's name or mobile preselects that person (retail only),
 * the customer record is copied onto the draft with setCustomerLedger (which also drops the previous person) + setCustomer.
 * Retail only: Counter bill. Wholesale bills one named party.
 */
export function CustomerSheet({ open, onClose }: Props) {
    const outletId = useOutletId();
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const draft = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId] : null));
    const setCustomer = useBillingStore((s) => s.setCustomer);
    const setCustomerLedger = useBillingStore((s) => s.setCustomerLedger);
    const setPatient = useBillingStore((s) => s.setPatient);
    const setWalkInName = useBillingStore((s) => s.setWalkInName);
    const startCounterBill = useBillingStore((s) => s.startCounterBill);

    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    // A popup (ModalShell) cannot sit on top of a bottom sheet, so the sheet steps aside while one is open
    const [adding, setAdding] = useState(false);

    const wholesale = draft?.saleType === 'WHOLESALE';
    const ledger = draft?.customerLedger ?? null;
    const customer = draft?.customer ?? null;
    const walkInName = draft?.walkInName ?? null;

    useEffect(() => {
        if (open) { setQuery(''); setDebounced(''); } else { setAdding(false); }
    }, [open]);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query), 300);
        return () => clearTimeout(t);
    }, [query]);

    const { data, isFetching } = useQuery({
        queryKey: ['ledgers', 'search', 'Sundry Debtors', debounced, outletId],
        queryFn: async () => {
            if (!outletId) return [];
            return (await voucherApi.getLedgers(outletId, { group: 'Sundry Debtors', search: debounced || undefined, limit: 50 })) as Ledger[];
        },
        enabled: open && !!outletId,
    });
    const rows = useMemo(() => data ?? [], [data]);

    // One place that puts a customer (and, for a family, who it is for) on the bill; the same steps as the desktop header
    const selectCustomer = (picked: Ledger, member: FamilyMember | null) => {
        setCustomerLedger(picked);                                         // also clears the previous patient and any walk-in name
        setPatient(wholesale ? null : member);                             // null = Self; wholesale bills one party, never a family member
        setCustomer({
            id: picked.linkedCustomerId || picked.id,
            name: picked.name,
            phone: picked.phone || '',
            gstin: picked.gstin || '',
            address: picked.address || '',
            creditLimit: (picked as any).creditLimit,
            dlNo20b: (picked as any).dlNo20b,
            dlNo21b: (picked as any).dlNo21b,
            dlExpiry: (picked as any).dlExpiry,
            customerType: (picked as any).customerType,
            stateCode: (picked as any).stateCode,
        } as any);
    };

    const choose = (picked: Ledger) => {
        let member: FamilyMember | null = null;
        if (!wholesale) {
            // searching "priya" or her own mobile finds the family; start the bill for her, not for the account owner
            const q = query.trim().toLowerCase();
            if (q.length >= 2) {
                member = picked.familyMembers?.find((m) => !m.isAccountHolder && (m.name.toLowerCase().includes(q) || (m.phone ?? '').includes(q))) ?? null;
            }
        }
        selectCustomer(picked, member);
        onClose();
    };

    if (!activeDraftId || !draft) return null;

    const typed = query.trim();
    const showDue = !wholesale && ledger && !(ledger as any).isMock && (Number(ledger.currentBalance) > 0 || Number((customer as any)?.creditLimit) > 0);

    return (
        <>
            <SheetShell
                open={open && !adding}
                onClose={onClose}
                title="Customer"
                description={wholesale ? 'Wholesale bills go to one named customer.' : 'Search by name or mobile number.'}
                footer={
                    <Button className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')} onClick={() => setAdding(true)}>
                        <Plus className="h-4 w-4" aria-hidden /> Add new customer
                    </Button>
                }
            >
                <div className="space-y-4">
                    {/* Who is on the bill now */}
                    {walkInName && !ledger && (
                        <div data-testid="walk-in-chip" className="flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 shadow-sm">
                            <span className="min-w-0">
                                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><UserX className="h-4 w-4 shrink-0 text-slate-700" aria-hidden /><span className="truncate">{walkInName}</span></span>
                                <span className="block text-xs font-medium text-slate-600">Walk-in · no mobile number · history is not kept</span>
                            </span>
                            <Button variant="outline" className={cn(T.btn, 'h-11 shrink-0')} aria-label="Remove walk-in customer" onClick={() => setWalkInName(null)}>Change</Button>
                        </div>
                    )}
                    {ledger && (
                        <section aria-label="Selected customer" className={cn(T.selected, 'space-y-1.5 rounded-xl border-2 p-3')}>
                            <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 break-words text-sm font-bold text-slate-900">{cleanLedgerName(ledger.name)}</p>
                                <Button variant="outline" className="h-11 shrink-0 rounded-xl border-2 border-red-600 bg-white font-bold text-red-700 hover:bg-red-50 hover:text-red-800 active:bg-red-50" onClick={() => { startCounterBill(); }}>
                                    <X className="h-4 w-4" aria-hidden /> Remove
                                </Button>
                            </div>
                            <p className="text-sm font-medium text-slate-900">{ledger.phone || 'No mobile number'}</p>
                            <p className="break-words text-sm text-slate-600">{ledger.address || 'No address'}</p>
                            {ledger.gstin && <p className="text-sm font-semibold text-sky-900">GSTIN {ledger.gstin}</p>}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {showDue && (
                                    <>
                                        <span className={cn(T.money, 'rounded border px-2 py-1 text-xs font-bold', Number(ledger.currentBalance) > 0 ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-300 bg-slate-100 text-slate-800')}>
                                            Due {inr(ledger.currentBalance)}
                                        </span>
                                        {Number((customer as any)?.creditLimit) > 0 && (
                                            <span className="rounded border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-bold tabular-nums text-emerald-800">Limit {inr((customer as any).creditLimit)}</span>
                                        )}
                                    </>
                                )}
                                {wholesale && customer && (
                                    <>
                                        <span className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">DL {customer.dlNo20b || customer.dlNo21b || 'N/A'}</span>
                                        <span className="rounded border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-bold tabular-nums text-emerald-800">Limit {inr(customer.creditLimit || 0)}</span>
                                        <span className={cn(T.money, 'rounded border px-2 py-1 text-xs font-bold', (customer.outstanding || 0) > 0 ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-300 bg-slate-100 text-slate-800')}>
                                            Out {inr(customer.outstanding || 0)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Retail only: the two ways to bill without a customer record */}
                    {!wholesale && (
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                type="button" data-testid="counter-bill"
                                onClick={() => { startCounterBill(); onClose(); }}
                                className={cn(T.btn, 'flex min-h-12 touch-manipulation items-center gap-2 px-3 py-2 text-left text-sm')}
                            >
                                <Receipt className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> Counter bill
                            </button>
                        </div>
                    )}

                    {/* Search */}
                    <div className="space-y-1.5">
                        <Label htmlFor="mobile-customer-search" className={T.label}>{ledger ? 'Change customer' : 'Find customer'}</Label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden />
                            <Input
                                id="mobile-customer-search" type="search" inputMode="search" autoComplete="off"
                                className={cn(T.input, 'h-12 pl-9 text-base')}
                                placeholder="Name or mobile number…"
                                value={query} onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <ul className="space-y-2" aria-label="Customers">
                        {isFetching && rows.length === 0 && (
                            <li className="flex items-center justify-center py-4 text-slate-700"><Loader2 className="h-5 w-5 animate-spin" aria-label="Searching" /></li>
                        )}
                        {rows.map((row) => (
                            <li key={row.id}>
                                <button
                                    type="button" onClick={() => choose(row)}
                                    className={cn(T.card, 'flex min-h-14 w-full touch-manipulation flex-col justify-center px-3 py-2 text-left active:bg-sky-50')}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 truncate text-sm font-bold text-slate-900">{cleanLedgerName(row.name)}</span>
                                        {row.phone && <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-bold tabular-nums text-slate-800">{row.phone}</span>}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs font-medium text-slate-600">
                                        {row.address || row.groupName}
                                        {!wholesale && row.isFamilyAccount && (row.familyMembers?.length ?? 0) > 1 && (
                                            <span className="font-semibold text-indigo-800"> · Family: {row.familyMembers!.map((m) => m.name.split(' ')[0]).join(', ')}</span>
                                        )}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>

                    {!isFetching && rows.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-400 bg-white px-3 py-4 text-center text-sm text-slate-900">
                            {typed ? (
                                <div className="space-y-3">
                                    <p>No customer found for <b>{typed}</b>.</p>
                                    <Button data-testid="add-new-customer-prompt" className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')} onClick={() => setAdding(true)}>
                                        <Plus className="h-4 w-4" aria-hidden /> Add new customer
                                    </Button>
                                </div>
                            ) : 'No customers yet.'}
                        </div>
                    )}
                </div>
            </SheetShell>

            {outletId && (
                <NewCustomerModal
                    open={open && adding}
                    onClose={() => setAdding(false)}
                    outletId={outletId}
                    initialQuery={typed}
                    onCreated={(created) => { selectCustomer(created, null); setAdding(false); onClose(); }}
                />
            )}
        </>
    );
}
