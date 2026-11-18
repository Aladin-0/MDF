'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { ago, dateTimeText, paramLabel, type AuditRule } from '@/lib/audit';
import { downloadEditLog, fetchPolicy, savePolicy } from '@/lib/auditApi';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function RuleRow({ rule, onChange }: { rule: AuditRule; onChange: (r: AuditRule) => void }) {
    return (
        <li className="rounded-lg border bg-card p-3">
            <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={rule.enabled} onChange={(e) => onChange({ ...rule, enabled: e.target.checked })} aria-label={`${rule.title} on or off`} />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{rule.title}</div>
                    <p className="text-xs text-muted-foreground">{rule.why}</p>
                    {rule.enabled && Object.keys(rule.params).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-3">
                            {Object.entries(rule.params).map(([k, v]) => (
                                <label key={k} className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                                    {paramLabel(rule.code, k)}
                                    <Input type="number" inputMode="decimal" min={1} value={v} className="h-9 w-28" onChange={(e) => onChange({ ...rule, params: { ...rule.params, [k]: Number(e.target.value) } })} />
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

/** How long the trail is kept, which rules are on and how sensitive, the health of the recorder, and the accountant's edit-log report. */
export function SettingsTab() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const policy = useQuery({ queryKey: ['audit', 'policy'], queryFn: fetchPolicy });
    const [days, setDays] = useState('365');
    const [rules, setRules] = useState<AuditRule[]>([]);
    const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return iso(d); });
    const [to, setTo] = useState(() => iso(new Date()));
    const [busyReport, setBusyReport] = useState(false);

    useEffect(() => { if (policy.data) { setDays(String(policy.data.retentionDays)); setRules(policy.data.rules); } }, [policy.data]);

    const save = useMutation({
        mutationFn: () => {
            const changed: Record<string, Record<string, number | boolean>> = {};
            rules.forEach((r) => {
                const base = policy.data!.rules.find((x) => x.code === r.code)!;
                const diff: Record<string, number | boolean> = {};
                if (r.enabled !== base.enabled) diff.enabled = r.enabled;
                Object.entries(r.params).forEach(([k, v]) => { if (v !== base.params[k]) diff[k] = v; });
                if (Object.keys(diff).length) changed[r.code] = diff;
            });
            return savePolicy({ retentionDays: Number(days), rules: changed });
        },
        onSuccess: (p) => { qc.setQueryData(['audit', 'policy'], p); toast({ title: 'Saved', description: 'The audit settings were updated.' }); },
        onError: (err) => toast({ title: 'Could not save', description: apiErrorMessage(err), variant: 'destructive' }),
    });

    if (policy.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
    if (policy.error || !policy.data) return <p role="alert" className="text-sm text-destructive">{apiErrorMessage(policy.error)}</p>;
    const h = policy.data.health;
    const min = policy.data.minRetentionDays;
    const daysOk = Number.isInteger(Number(days)) && Number(days) >= min && Number(days) <= 3650;

    async function report() {
        setBusyReport(true);
        try { await downloadEditLog(from, to); }
        catch (err) { toast({ title: 'Could not create the report', description: apiErrorMessage(err), variant: 'destructive' }); }
        finally { setBusyReport(false); }
    }

    return (
        <div className="space-y-6">
            {h.failedWrites > 0 && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span><strong>{h.failedWrites} audit record(s) could not be saved.</strong> The actions themselves went through, but they are missing from the trail. Check the server log for “AUDIT WRITE FAILED”.</span>
                </div>
            )}

            <section aria-label="Recorder health" className="rounded-lg border bg-card p-3 sm:p-4">
                <h2 className="text-sm font-semibold">Is it recording?</h2>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Events on record</dt><dd className="tabular-nums">{h.events.toLocaleString('en-IN')}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Latest event</dt><dd>{h.lastEventAt ? ago(h.lastEventAt) : 'none yet'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Oldest event</dt><dd>{h.oldestEventAt ? dateTimeText(h.oldestEventAt) : '—'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last clean-up</dt><dd>{h.lastPurgeAt ? `${ago(h.lastPurgeAt)} (${h.lastPurgeCount} removed)` : 'not yet'}</dd></div>
                </dl>
            </section>

            <section aria-label="How long to keep" className="rounded-lg border bg-card p-3 sm:p-4">
                <h2 className="text-sm font-semibold">How long to keep the trail</h2>
                <p className="mt-1 text-xs text-muted-foreground">Older records are removed automatically. Bill and purchase revision history (the “History” screens) is not touched.</p>
                <div className="mt-2 flex items-end gap-2">
                    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">Days to keep
                        <Input type="number" inputMode="numeric" min={min} max={3650} value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-32" aria-invalid={!daysOk} />
                    </label>
                    <span className="pb-2 text-xs text-muted-foreground">{daysOk ? `About ${(Number(days) / 365).toFixed(1)} year(s)` : `Between ${min} and 3650 days`}</span>
                </div>
            </section>

            <section aria-label="Warnings">
                <h2 className="text-sm font-semibold">What counts as suspicious</h2>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">Each rule explains itself when it fires. Raise a number to get fewer flags, lower it for more.</p>
                <ul className="space-y-2">{rules.map((r) => <RuleRow key={r.code} rule={r} onChange={(n) => setRules((all) => all.map((x) => (x.code === n.code ? n : x)))} />)}</ul>
            </section>

            <Button type="button" onClick={() => save.mutate()} disabled={!daysOk || save.isPending} className="w-full sm:w-auto">
                {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save settings
            </Button>

            <section aria-label="Edit log report" className="rounded-lg border bg-card p-3 sm:p-4">
                <h2 className="text-sm font-semibold">Edit log summary (for your accountant)</h2>
                <p className="mt-1 text-xs text-muted-foreground">For each person: how many records they created, changed, and cancelled or removed.</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /></label>
                    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">To<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /></label>
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={report} disabled={busyReport || !from || !to}>
                        {busyReport ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" aria-hidden="true" />} Excel
                    </Button>
                </div>
            </section>
        </div>
    );
}
