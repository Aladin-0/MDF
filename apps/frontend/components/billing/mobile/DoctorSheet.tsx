'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Search, Stethoscope, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreateDoctorModal } from '@/components/billing/CreateDoctorModal';
import { useOutletId } from '@/hooks/useOutletId';
import { doctorsApi } from '@/lib/apiClient';
import { useBillingStore } from '@/store/billingStore';
import type { Doctor } from '@/types';
import { cn } from '@/lib/utils';
import { SheetShell } from './SheetShell';
import { T } from './theme';

interface Props {
    open: boolean;
    onClose: () => void;
}

/** Prescribing-doctor picker (retail). Same search call as the desktop DoctorPicker: name or registration no., 300ms debounce, limit 50. */
export function DoctorSheet({ open, onClose }: Props) {
    const outletId = useOutletId();
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const doctor = useBillingStore((s) => (s.activeDraftId ? s.drafts[s.activeDraftId]?.doctor ?? null : null));
    const setDoctor = useBillingStore((s) => s.setDoctor);

    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [adding, setAdding] = useState(false);          // the popup cannot sit on a bottom sheet, so the sheet steps aside

    useEffect(() => {
        if (open) { setQuery(''); setDebounced(''); } else setAdding(false);
    }, [open]);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query), 300);
        return () => clearTimeout(t);
    }, [query]);

    const { data, isFetching } = useQuery({
        queryKey: ['doctors', 'search', debounced, outletId],
        queryFn: async () => {
            if (!outletId) return [];
            return (await doctorsApi.search(outletId, debounced || undefined, 50)) as Doctor[];
        },
        enabled: open && !!outletId,
    });
    const rows = useMemo(() => data ?? [], [data]);

    if (!activeDraftId) return null;
    const typed = query.trim();

    return (
        <>
            <SheetShell
                open={open && !adding}
                onClose={onClose}
                title="Prescribing doctor"
                description="Search by doctor name or registration number."
                footer={
                    <Button className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')} onClick={() => setAdding(true)}>
                        <Plus className="h-4 w-4" aria-hidden /> Add new doctor
                    </Button>
                }
            >
                <div className="space-y-4">
                    {doctor && (
                        <section aria-label="Selected doctor" className={cn(T.selected, 'flex items-start justify-between gap-2 rounded-xl border-2 p-3')}>
                            <div className="min-w-0">
                                <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Stethoscope className="h-4 w-4 shrink-0 text-sky-700" aria-hidden /><span className="truncate">{doctor.name}</span></p>
                                <p className="text-sm text-slate-600">{doctor.regNo ? `Reg. no. ${doctor.regNo}` : 'No registration number'}</p>
                            </div>
                            <Button variant="outline" className="h-11 shrink-0 rounded-xl border-2 border-red-600 bg-white font-bold text-red-700 hover:bg-red-50 hover:text-red-800 active:bg-red-50" onClick={() => setDoctor(null)}>
                                <X className="h-4 w-4" aria-hidden /> Clear
                            </Button>
                        </section>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="mobile-doctor-search" className={T.label}>{doctor ? 'Change doctor' : 'Find doctor'}</Label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden />
                            <Input
                                id="mobile-doctor-search" type="search" inputMode="search" autoComplete="off"
                                className={cn(T.input, 'h-12 pl-9 text-base')}
                                placeholder="Doctor name or registration no…"
                                value={query} onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <ul className="space-y-2" aria-label="Doctors">
                        {isFetching && rows.length === 0 && (
                            <li className="flex items-center justify-center py-4 text-slate-700"><Loader2 className="h-5 w-5 animate-spin" aria-label="Searching" /></li>
                        )}
                        {rows.map((d) => (
                            <li key={d.id}>
                                <button
                                    type="button"
                                    onClick={() => { setDoctor(d); onClose(); }}
                                    className={cn(T.card, 'flex min-h-14 w-full touch-manipulation flex-col justify-center px-3 py-2 text-left active:bg-sky-50')}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 truncate text-sm font-bold text-slate-900">{d.name}</span>
                                        {d.regNo && <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-800">{d.regNo}</span>}
                                    </span>
                                    {(d.specialty || d.hospitalName) && (
                                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-600">{[d.specialty, d.hospitalName].filter(Boolean).join(' · ')}</span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>

                    {!isFetching && rows.length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-400 bg-white px-3 py-4 text-center text-sm text-slate-900">
                            {typed ? <>No doctor found for <b>{typed}</b>. Use Add new doctor below.</> : 'No doctors found.'}
                        </p>
                    )}
                </div>
            </SheetShell>

            {open && adding && (
                <CreateDoctorModal
                    initialName={typed}
                    onSave={(created) => { setDoctor(created); setAdding(false); onClose(); }}
                    onClose={() => setAdding(false)}
                />
            )}
        </>
    );
}
