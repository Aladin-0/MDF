'use client';

import { Check, User, Users, Share2, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CustomerLookup } from './CustomerLookup';

export type AccountMode = 'own' | 'join' | 'shared';

export interface FamilyFormValues {
    gender: string;
    relationship: string;
    isFamilyAccount: boolean;
    accountHolderId: string;
    accountHolderName: string;
    /** own = bills to themselves; join = bills under another customer's account; shared = a joint account nobody owns personally */
    accountMode: AccountMode;
}

export const RELATIONSHIPS = ['Self', 'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other'];

interface Props {
    values: FamilyFormValues;
    onPatch: (patch: Partial<FamilyFormValues>) => void;
    outletId: string;
    personName?: string;
    /** Editing an existing customer: joining / leaving an account is done on the customer page (it checks balances). */
    isEditing: boolean;
    isMember?: boolean;
    error?: string;
}

const MODES: { id: AccountMode; icon: typeof User; title: string; text: string }[] = [
    { id: 'own', icon: User, title: 'Own account', text: 'Bills and credit are tracked for this person alone.' },
    { id: 'join', icon: Users, title: "Under another customer's account", text: 'For family: one shared ledger, balance and credit limit. Medical history stays separate.' },
    { id: 'shared', icon: Share2, title: 'Shared family account', text: 'A joint account such as “Sharma Family” that no single person owns.' },
];

/** The "who pays for this customer" section of the customer form. */
export function FamilyFields({ values, onPatch, outletId, personName, isEditing, isMember, error }: Props) {
    const mode = values.accountMode;
    const who = personName?.trim() || 'This person';

    return (
        <div className="space-y-3" data-testid="family-fields">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Users className="w-3 h-3 inline mr-1" />Credit account &amp; family
            </p>

            {!isEditing && (
                <div role="radiogroup" aria-label="Credit account" className="grid gap-2">
                    {MODES.map(({ id, icon: Icon, title, text }) => {
                        const active = mode === id;
                        return (
                            <button key={id} type="button" role="radio" aria-checked={active}
                                onClick={() => onPatch({
                                    accountMode: id,
                                    isFamilyAccount: id === 'shared',
                                    ...(id !== 'join' ? { accountHolderId: '', accountHolderName: '' } : {}),
                                })}
                                className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                                    active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:bg-muted')}>
                                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold">{title}</span>
                                    <span className="block text-xs text-muted-foreground">{text}</span>
                                </span>
                                {active && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {!isEditing && mode === 'join' && (
                <div className="space-y-2 rounded-lg border border-input p-3">
                    <Label className="text-sm">Whose account? <span className="text-red-500">*</span></Label>
                    {values.accountHolderId ? (
                        <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2.5">
                            <span className="text-sm">
                                <b>{who}</b> will bill under <b>{values.accountHolderName}</b>’s account
                            </span>
                            <button type="button" aria-label="Choose a different account" onClick={() => onPatch({ accountHolderId: '', accountHolderName: '' })}>
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>
                    ) : (
                        <CustomerLookup outletId={outletId} mode="owners" ariaLabel="Search the account owner"
                            placeholder="Search the customer whose account to use…"
                            onPick={(r) => onPatch({ accountHolderId: r.id, accountHolderName: r.name })} />
                    )}
                    {error && !values.accountHolderId && <p className="text-xs text-red-500">{error}</p>}
                    <p className="text-xs text-muted-foreground">
                        Credit given to {who === 'This person' ? 'them' : who} is added to that customer’s balance and limit.
                    </p>
                </div>
            )}

            {mode !== 'shared' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Gender</Label>
                        <select aria-label="Gender" className="w-full h-9 rounded-md border px-2 text-sm" value={values.gender} onChange={(e) => onPatch({ gender: e.target.value })}>
                            <option value="">—</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">{mode === 'join' && values.accountHolderName ? `Relationship to ${values.accountHolderName}` : 'Relationship'}</Label>
                        <select aria-label="Relationship" className="w-full h-9 rounded-md border px-2 text-sm" value={values.relationship}
                            onChange={(e) => onPatch({ relationship: e.target.value === 'Self' ? '' : e.target.value })}>
                            <option value="">—</option>
                            {RELATIONSHIPS.map((r) => <option key={r} value={r === 'Self' ? '' : r}>{r}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {isEditing && (
                <p className="text-xs text-muted-foreground">
                    {isMember ? 'Credit limit and balance belong to the account owner.' : 'To put this person under another customer’s account, use the Family card on their page.'}
                </p>
            )}
        </div>
    );
}
