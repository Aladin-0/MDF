'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FamilyMember, Ledger } from '@/types';

interface Props {
    /** No customer yet: the field stays in the grid (so the header does not jump) but is disabled. */
    ledger: Ledger | null;
    /** The person the bill is for; null = Self (the account owner). */
    patient: FamilyMember | null | undefined;
    /** null selects Self. */
    onSelect: (m: FamilyMember | null) => void;
    onAdd: () => void;
}

const clean = (name: string) => name.replace(/\s*\(\d{8,}\)\s*$/, '');          // ledgers are named "Name (mobile)"

/**
 * "Billing For": who is this bill for? Defaults to Self. Built from the same pieces as the customer search next to it (a 36px
 * bordered chip, the picker's list style and its "ADD NEW …" footer) so the header reads as one family of fields.
 */
export function BillingFor({ ledger, patient, onSelect, onAdd }: Props) {
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', away);
        return () => document.removeEventListener('mousedown', away);
    }, []);

    const label = (
        <label className="text-[11px] font-bold text-slate-600 h-6 flex items-center">Billing For</label>
    );

    if (!ledger) {
        return (
            <div data-testid="billing-for">
                {label}
                <div className="h-9 px-3 border border-slate-300 rounded bg-slate-50 flex items-center text-sm text-slate-400">Select a customer first</div>
            </div>
        );
    }

    const ownerId = (ledger as any).linkedCustomerId as string;
    const listed = ledger.familyMembers ?? [];
    const sharedRecord = !!ledger.isFamilyAccount && listed.length > 0 && !listed.some((m) => m.isAccountHolder);   // nobody is "Self"
    const self: FamilyMember = listed.find((m) => m.isAccountHolder) ?? { id: ownerId, name: clean(ledger.name), phone: ledger.phone, isAccountHolder: true };
    const options: FamilyMember[] = sharedRecord ? listed : [self, ...listed.filter((m) => !m.isAccountHolder)];
    const selected: FamilyMember | null = patient && patient.id !== self.id ? patient : (sharedRecord ? null : self);
    const needsChoice = sharedRecord && !patient;
    const relationOf = (m: FamilyMember) => (m.isAccountHolder ? 'Self' : m.relationship || '');

    const choose = (m: FamilyMember) => { onSelect(m.isAccountHolder ? null : m); setOpen(false); };

    const onKey = (e: React.KeyboardEvent) => {
        if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); setHi(Math.max(0, options.findIndex((o) => o.id === selected?.id))); } return; }
        if (e.key === 'Escape') { setOpen(false); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
        if (e.key === 'Enter') { e.preventDefault(); if (hi === options.length) { setOpen(false); onAdd(); } else choose(options[hi]); }
    };

    return (
        <div ref={root} className="relative" data-testid="billing-for">
            {label}
            <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); setHi(0); }} onKeyDown={onKey}
                className={cn('w-full h-9 px-3 border-2 rounded flex items-center justify-between gap-2 text-left transition-colors',
                    needsChoice ? 'border-amber-400 bg-amber-50' : 'border-blue-400 bg-blue-50/50 hover:bg-blue-50')}>
                <span className="flex items-center gap-2 min-w-0">
                    {selected ? (
                        <>
                            <span className="font-semibold text-blue-900 text-sm truncate">{clean(selected.name)}</span>
                            <span className="text-[10px] bg-white text-slate-800 px-1.5 py-0.5 rounded font-bold shrink-0">{relationOf(selected) || 'Self'}</span>
                        </>
                    ) : <span className="text-sm font-semibold text-amber-700">Select who this bill is for</span>}
                </span>
                <ChevronDown className={cn('w-4 h-4 shrink-0 text-blue-700 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div role="listbox" aria-label="Billing for" className="absolute top-full left-0 right-0 min-w-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="max-h-60 overflow-y-auto p-1">
                        {options.map((m, i) => {
                            const active = selected?.id === m.id;
                            return (
                                <div key={m.id} role="option" aria-selected={active} onMouseEnter={() => setHi(i)} onClick={() => choose(m)}
                                    className={cn('px-3 py-3 min-h-[48px] cursor-pointer rounded flex flex-col transition-colors select-none',
                                        i === hi ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-blue-50')}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn('text-sm font-bold truncate', i === hi || active ? 'text-blue-900' : 'text-slate-700')}>{clean(m.name)}</span>
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{relationOf(m) || '—'}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{m.phone || ledger.phone}{m.age != null ? ` • ${m.age} yrs` : ''}</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="p-2 bg-slate-50 border-t border-slate-100">
                        <button type="button" onMouseEnter={() => setHi(options.length)} onClick={() => { setOpen(false); onAdd(); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[40px] text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded transition-colors border border-blue-100 select-none">
                            <Plus className="w-3.5 h-3.5" /> ADD NEW FAMILY MEMBER
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
