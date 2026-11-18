'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, ShieldAlert } from 'lucide-react';
import { ActivityTab } from '@/components/audit/ActivityTab';
import { AttentionTab } from '@/components/audit/AttentionTab';
import { EventDetail } from '@/components/audit/EventDetail';
import { PeopleTab } from '@/components/audit/PeopleTab';
import { SettingsTab } from '@/components/audit/SettingsTab';
import { usePermissions } from '@/hooks/usePermissions';
import { EMPTY_FILTERS, ago, type AuditEvent, type EventFilters } from '@/lib/audit';
import { fetchEvent, fetchPeople, fetchSummary } from '@/lib/auditApi';
import { cn } from '@/lib/utils';

type Tab = 'attention' | 'activity' | 'people' | 'settings';
const TABS: { id: Tab; label: string }[] = [
    { id: 'attention', label: 'Needs attention' },
    { id: 'activity', label: 'Activity' },
    { id: 'people', label: 'People' },
    { id: 'settings', label: 'Settings' },
];

export default function AuditPage() {
    const { hasPermission } = usePermissions();
    const allowed = hasPermission('view_audit_trail');
    const [tab, setTab] = useState<Tab>('attention');
    const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
    const [open, setOpen] = useState<AuditEvent | null>(null);
    const [pickedTab, setPickedTab] = useState(false);

    const summary = useQuery({ queryKey: ['audit', 'summary'], queryFn: fetchSummary, enabled: allowed, refetchInterval: 60_000 });
    const people = useQuery({ queryKey: ['audit', 'people', 30], queryFn: () => fetchPeople(30), enabled: allowed, staleTime: 60_000 });

    // open on "Activity" when there is nothing to look at (unless the person already chose a tab)
    useEffect(() => {
        if (!pickedTab && summary.data && summary.data.newFlags.total === 0) setTab('activity');
    }, [summary.data, pickedTab]);

    if (!allowed) {
        return (
            <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-20 text-center">
                <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <h1 className="text-lg font-semibold">Only the owner can open the audit trail</h1>
                <p className="text-sm text-muted-foreground">It records who did what in every shop, so it is limited to the super admin account.</p>
            </div>
        );
    }

    const s = summary.data;
    const flagTotal = s?.newFlags.total ?? 0;
    const pick = (t: Tab) => { setPickedTab(true); setTab(t); };
    const openEventById = async (id: string) => { try { setOpen(await fetchEvent(id)); } catch { /* the toast of the failed request is shown by the shared client */ } };

    return (
        <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
            <header className="mb-4">
                <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldAlert className="h-5 w-5" aria-hidden="true" /> Audit trail</h1>
                <p className="text-sm text-muted-foreground">Who changed what, and when. {s ? `${s.eventsToday} event${s.eventsToday === 1 ? '' : 's'} today · last ${s.lastEventAt ? ago(s.lastEventAt) : 'never'} · kept for ${s.retentionDays} days` : ''}</p>
            </header>

            <div role="tablist" aria-label="Audit sections" className="mb-4 flex gap-1 overflow-x-auto border-b">
                {TABS.map((t) => (
                    <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => pick(t.id)}
                        className={cn('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium', tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                        {t.label}
                        {t.id === 'attention' && flagTotal > 0 && (
                            <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold', s && s.newFlags.critical > 0 ? 'bg-red-600 text-white' : 'bg-amber-500 text-white')} aria-label={`${flagTotal} to look at`}>{flagTotal}</span>
                        )}
                        {t.id === 'settings' && !!s?.failedWrites && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" aria-label="Some records could not be saved" />}
                    </button>
                ))}
            </div>

            {tab === 'attention' && <AttentionTab onOpenEvent={openEventById} />}
            {tab === 'activity' && <ActivityTab filters={filters} setFilters={setFilters} people={people.data?.results ?? []} onOpen={setOpen} />}
            {tab === 'people' && <PeopleTab people={people.data?.results ?? []} loading={people.isLoading} days={30} onShow={(id) => { setFilters({ ...EMPTY_FILTERS, actor: id }); pick('activity'); }} />}
            {tab === 'settings' && <SettingsTab />}

            {open && <EventDetail event={open} onClose={() => setOpen(null)} />}
        </div>
    );
}
