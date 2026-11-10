'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { CustomerLookup, LookupResult } from '@/components/customers/CustomerLookup';
import type { FamilyMember } from '@/types';

interface Props {
    open: boolean;
    onClose: () => void;
    outletId: string;
    /** The customer whose account the person will bill under (their ledger, balance and credit limit are shared). */
    ownerId: string;
    ownerName: string;
    ownerPhone: string;
    onAdded: (member: FamilyMember) => void;
}

/** Relations offered as radio buttons; the gender follows from the relation so the cashier is not asked twice. */
export const FAMILY_RELATIONS: { label: string; gender: 'M' | 'F' | '' }[] = [
    { label: 'Brother', gender: 'M' }, { label: 'Sister', gender: 'F' }, { label: 'Father', gender: 'M' }, { label: 'Mother', gender: 'F' },
    { label: 'Son', gender: 'M' }, { label: 'Daughter', gender: 'F' }, { label: 'Husband', gender: 'M' }, { label: 'Wife', gender: 'F' },
    { label: 'Grandfather', gender: 'M' }, { label: 'Grandmother', gender: 'F' }, { label: 'Other', gender: '' },
];

const toMember = (d: any): FamilyMember => ({ id: d.id, name: d.name, relationship: d.relationship, gender: d.gender, age: d.age, phone: d.phone });
const serverReason = (err: unknown) => (err as any)?.response?.data?.detail ?? apiErrorMessage(err);

/** Add New Family Member: pick the relation, give a name (mobile optional), done. A second mode links an existing customer. */
export function AddFamilyMemberDialog({ open, onClose, outletId, ownerId, ownerName, ownerPhone, onAdded }: Props) {
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [relation, setRelation] = useState('');
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    const [phone, setPhone] = useState('');
    const [dob, setDob] = useState('');
    const [picked, setPicked] = useState<LookupResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => { setRelation(''); setFirst(''); setLast(''); setPhone(''); setDob(''); setPicked(null); setError(null); setMode('new'); };
    const close = () => { reset(); onClose(); };
    const phoneOk = !phone || /^[6-9]\d{9}$/.test(phone);
    const canSubmit = !busy && !!relation && (mode === 'new' ? !!first.trim() && phoneOk : !!picked);

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            const gender = FAMILY_RELATIONS.find((r) => r.label === relation)?.gender ?? '';
            const res = mode === 'new'
                ? await api.post('/customers/', {
                    outletId, name: [first.trim(), last.trim()].filter(Boolean).join(' '), accountHolderId: ownerId,
                    // blank mobile = the dependent shares the primary's number (the server fills it in)
                    phone: phone || undefined, relationship: relation, gender: gender || undefined, dob: dob || undefined,
                })
                : await api.post(`/customers/${picked!.id}/account/`, { outletId, accountHolderId: ownerId, relationship: relation, gender });
            onAdded(toMember(res.data));
            close();
        } catch (err) {
            setError(serverReason(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ModalShell open={open} onClose={close} title="Add New Family Member" size="md"
            footer={<>
                <Button onClick={submit} disabled={!canSubmit} className="flex-1">{busy ? 'Saving...' : mode === 'new' ? 'Add' : 'Link'}</Button>
                <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
            </>}>
            <p className="text-sm text-muted-foreground">
                Billed under <span className="font-semibold text-foreground">{ownerName}</span>’s account: one ledger, balance and credit limit.
                Each person keeps their own prescriptions and history.
            </p>

            <ModalSection title="Relation *">
                <div role="radiogroup" aria-label="Relation" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {FAMILY_RELATIONS.map((r) => (
                        <label key={r.label}
                            className={cn('flex items-center gap-2 h-10 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted',
                                relation === r.label && 'border-primary bg-primary/5 font-medium')}>
                            <input type="radio" name="family-relation" value={r.label} checked={relation === r.label} onChange={() => setRelation(r.label)} className="accent-primary" />
                            {r.label}
                        </label>
                    ))}
                </div>
            </ModalSection>

            {mode === 'new' ? (
                <ModalSection title="Details">
                    <form autoComplete="off" className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                        <div className="space-y-1.5">
                            <Label>First Name *</Label>
                            <Input aria-label="First Name" name="fm-first" autoFocus value={first} onChange={(e) => setFirst(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Last Name</Label>
                            <Input aria-label="Last Name" name="fm-last" value={last} onChange={(e) => setLast(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Mobile Number</Label>
                            <Input aria-label="Mobile Number" name="fm-mobile" type="tel" inputMode="numeric" value={phone} placeholder="Optional"
                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className={cn(!phoneOk && 'border-red-400')} />
                            <p className={cn('text-xs', phoneOk ? 'text-muted-foreground' : 'text-red-500')}>
                                {phoneOk ? `Leave blank to use ${ownerName}’s number${ownerPhone ? ` (${ownerPhone})` : ''}.` : 'Enter a valid 10-digit mobile number.'}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Date of Birth</Label>
                            <Input aria-label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                            <p className="text-xs text-muted-foreground">Optional. Shows their age when billing.</p>
                        </div>
                        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
                    </form>
                </ModalSection>
            ) : (
                <ModalSection title="Existing customer">
                    {picked ? (
                        <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-muted/40 text-sm">
                            <span><span className="font-medium">{picked.name}</span> <span className="text-muted-foreground">{picked.phone}</span></span>
                            <button type="button" className="text-xs font-semibold text-primary uppercase tracking-wide" onClick={() => setPicked(null)}>Change</button>
                        </div>
                    ) : (
                        <CustomerLookup outletId={outletId} mode="people" excludeId={ownerId} ariaLabel="Search existing customers" placeholder="Search by name or mobile…" onPick={setPicked} />
                    )}
                    <p className="text-xs text-muted-foreground mt-2">A customer who already owes money on their own account can’t be moved here until that balance is settled.</p>
                </ModalSection>
            )}

            <button type="button" onClick={() => { setMode(mode === 'new' ? 'existing' : 'new'); setError(null); }}
                className="text-sm font-semibold text-primary uppercase tracking-wide hover:text-primary/80 transition-colors text-left">
                {mode === 'new' ? '▶ Link an existing customer instead' : '▶ Add a new person instead'}
            </button>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </ModalShell>
    );
}
