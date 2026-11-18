'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEVERITY, ago, comparison, dateTimeText, type AuditPerson } from '@/lib/audit';
import { cn } from '@/lib/utils';

function Stat({ label, n, vs }: { label: string; n: number; vs: number | null }) {
    const note = comparison(n, vs);
    return (
        <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold tabular-nums">{n}</div>
            {note && <div className="text-[11px] font-medium text-amber-700">{note}</div>}
        </div>
    );
}

/** One card per person: how much they did, how it compares with the others, and which devices they use. "Show activity" jumps to their feed. */
export function PeopleTab({ people, loading, days, onShow }: { people: AuditPerson[]; loading: boolean; days: number; onShow: (id: string) => void }) {
    if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
    if (people.length === 0) return <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Nobody has done anything in the last {days} days.</p>;
    return (
        <div>
            <p className="mb-3 text-xs text-muted-foreground">The last {days} days. “× the others” appears when someone does a lot more of something than the average of everyone else.</p>
            <div className="grid gap-3 md:grid-cols-2">
                {people.map((p) => (
                    <article key={p.id} className="rounded-lg border bg-card p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                                <p className="text-xs text-muted-foreground">{p.role.replace('_', ' ')} · last active <span title={dateTimeText(p.lastActive)}>{ago(p.lastActive)}</span></p>
                            </div>
                            {p.openFlags > 0 && <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold', SEVERITY.warning.chip)}>{p.openFlags} to look at</span>}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                            <Stat label="Actions" n={p.events} vs={null} />
                            <Stat label="Cancelled bills" n={p.cancelled} vs={p.cancelledVs} />
                            <Stat label="Paid bills changed" n={p.paidBillChanges} vs={p.paidBillChangesVs} />
                            <Stat label="Stock removed" n={p.writeOffs} vs={p.writeOffsVs} />
                        </div>
                        {p.devices.length > 0 && (
                            <p className="mt-3 text-xs text-muted-foreground">
                                Signs in from: {p.devices.map((d) => `${d.device} (${ago(d.lastSeen)})`).join(', ')}
                            </p>
                        )}
                        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onShow(p.id)}>Show {p.name.split(' ')[0]}&apos;s activity</Button>
                    </article>
                ))}
            </div>
        </div>
    );
}
