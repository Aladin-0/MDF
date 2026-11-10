'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, UserMinus, Link2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { AddFamilyMemberDialog } from '@/components/billing/AddFamilyMemberDialog';
import { CustomerLookup, LookupResult } from './CustomerLookup';
import { RELATIONSHIPS } from './FamilyFields';

interface Props {
    customerId: string;
    customerName: string;
    customerPhone: string;
    outletId: string;
}

interface Member { id: string; name: string; relationship?: string; gender?: string; age?: number | null; phone?: string; isAccountHolder?: boolean }
interface MembersResponse { accountId: string; accountName: string | null; isFamilyAccount: boolean; isSharedAccountRecord?: boolean; members: Member[] }

const label = (m: Member) => [m.age != null ? `${m.age}y` : null, m.gender, m.relationship].filter(Boolean).join(' · ');

/**
 * Family on the customer page. Anyone can own an account: "Add family member" puts a new or existing person under this
 * customer (one ledger, one balance, one credit limit); "Bill under another customer" moves this person under theirs.
 */
export function FamilyAccountCard({ customerId, customerName, customerPhone, outletId }: Props) {
    const queryClient = useQueryClient();
    const key = ['customer-members', customerId, outletId];
    const { data } = useQuery({
        queryKey: key,
        queryFn: async () => (await api.get(`/customers/${customerId}/members/`, { params: { outletId } })).data as MembersResponse,
    });
    const [busy, setBusy] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [joining, setJoining] = useState(false);
    const [owner, setOwner] = useState<LookupResult | null>(null);
    const [relationship, setRelationship] = useState('');

    if (!data) return null;
    const isMember = data.accountId !== customerId;
    const isShared = !!data.isSharedAccountRecord && !isMember;
    const people = data.members;
    const isOwner = !isMember && (people.length > 1 || isShared);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: key });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    };

    const run = async (fn: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await fn();
            toast({ title: done });
            setJoining(false); setOwner(null); setRelationship('');
            refresh();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Could not change the family', description: (err as any)?.response?.data?.detail ?? apiErrorMessage(err) });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="shadow-sm" data-testid="family-account-card">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <Users className="w-3.5 h-3.5" /> Family
                </div>

                {isMember ? (
                    <p className="text-sm">Bills under <b>{data.accountName}</b>’s account <span className="text-muted-foreground">— one shared ledger, balance and credit limit.</span></p>
                ) : isOwner ? (
                    <p className="text-sm"><b>{customerName}</b>’s account is shared by {people.length} {people.length === 1 ? 'person' : 'people'} <span className="text-muted-foreground">— one ledger, balance and credit limit.</span></p>
                ) : (
                    <p className="text-sm text-muted-foreground">Bills to {customerName} only. Add relatives who share this mobile number and credit.</p>
                )}

                {(isMember || isOwner) && (
                    <ul className="text-sm divide-y">
                        {people.map((m) => (
                            <li key={m.id} className="py-1.5 flex items-center justify-between gap-2">
                                <span>
                                    {m.name}
                                    <span className="text-muted-foreground"> ({label(m) || '—'})</span>
                                </span>
                                {!m.isAccountHolder && (
                                    <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove ${m.name}`}
                                        onClick={() => run(() => api.post(`/customers/${m.id}/account/`, { outletId, accountHolderId: null }), `${m.name} now bills on their own`)}>
                                        <UserMinus className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {!isMember && (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add family member</Button>
                        {!isOwner && (
                            <Button size="sm" variant="outline" onClick={() => setJoining((j) => !j)}><Link2 className="w-3.5 h-3.5 mr-1.5" /> Bill under another customer</Button>
                        )}
                    </div>
                )}

                {joining && !isMember && (
                    <div className="space-y-2 border-t pt-3">
                        {owner ? (
                            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                                <b>{customerName}</b> will bill under <b>{owner.name}</b>’s account.
                                <button type="button" className="ml-2 text-xs font-semibold text-indigo-700" onClick={() => setOwner(null)}>Change</button>
                            </div>
                        ) : (
                            <CustomerLookup outletId={outletId} mode="owners" excludeId={customerId} ariaLabel="Search the account owner"
                                placeholder="Search the customer whose account to use…" onPick={setOwner} />
                        )}
                        {owner && (
                            <>
                                <select className="w-full h-9 rounded border px-2 text-sm" value={relationship} onChange={(e) => setRelationship(e.target.value)} aria-label="Relationship">
                                    <option value="">Relationship to {owner.name}</option>
                                    {RELATIONSHIPS.filter((r) => r !== 'Self').map((r) => <option key={r}>{r}</option>)}
                                </select>
                                <Button size="sm" disabled={busy}
                                    onClick={() => run(() => api.post(`/customers/${customerId}/account/`, { outletId, accountHolderId: owner.id, relationship }), `Now bills under ${owner.name}`)}>
                                    Move under {owner.name}
                                </Button>
                            </>
                        )}
                    </div>
                )}

                <AddFamilyMemberDialog open={addOpen} onClose={() => setAddOpen(false)} outletId={outletId} ownerId={customerId}
                    ownerName={customerName} ownerPhone={customerPhone} onAdded={() => { toast({ title: 'Added to the family' }); refresh(); }} />
            </CardContent>
        </Card>
    );
}
