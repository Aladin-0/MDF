'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { SEVERITY, ago, dateTimeText, type AuditFlag } from '@/lib/audit';
import { fetchFlags, reviewFlag } from '@/lib/auditApi';
import { cn } from '@/lib/utils';

function FlagCard({ flag, onOpenEvent }: { flag: AuditFlag; onOpenEvent: (eventId: string) => void }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [dismissing, setDismissing] = useState(false);
    const [note, setNote] = useState('');
    const sev = SEVERITY[flag.severity];

    const review = useMutation({
        mutationFn: (v: { status: 'reviewed' | 'dismissed'; note: string }) => reviewFlag(flag.id, v.status, v.note),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit'] }); },
        onError: (err) => toast({ title: 'Could not save', description: apiErrorMessage(err), variant: 'destructive' }),
    });

    return (
        <article className="rounded-lg border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded border px-1.5 py-0.5 text-[11px] font-semibold', sev.chip)}>{sev.label}</span>
                <span className="text-xs text-muted-foreground" title={dateTimeText(flag.createdAt)}>{ago(flag.createdAt)}</span>
            </div>
            <h3 className="mt-1.5 text-sm font-semibold sm:text-base">{flag.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">Why this matters: </span>{flag.why}</p>
            <p className="mt-1 text-xs text-muted-foreground">
                {flag.event.device ? `${flag.event.device} · ` : ''}{flag.event.insideNetwork === false ? 'away from the shop network · ' : ''}
                <button type="button" className="underline underline-offset-2" onClick={() => onOpenEvent(flag.eventId)}>See exactly what happened</button>
            </p>

            {flag.status === 'new' ? (
                dismissing ? (
                    <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) review.mutate({ status: 'dismissed', note: note.trim() }); }}>
                        <Input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this fine? (a short note)" aria-label="Why is this not a problem" className="h-9" maxLength={300} />
                        <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={!note.trim() || review.isPending}>{review.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Save</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => { setDismissing(false); setNote(''); }}>Cancel</Button>
                        </div>
                    </form>
                ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => review.mutate({ status: 'reviewed', note: '' })} disabled={review.isPending}>
                            <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" /> I checked this
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDismissing(true)}>Not a problem</Button>
                    </div>
                )
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                    {flag.status === 'reviewed' ? 'Checked' : 'Marked not a problem'} by {flag.review.by || 'someone'}{flag.review.at ? ` ${ago(flag.review.at)}` : ''}
                    {flag.review.note ? `: “${flag.review.note}”` : ''}
                </p>
            )}
        </article>
    );
}

/** "Needs attention": the flags nobody has looked at yet, most serious first. A reviewed flag moves to "Looked at". */
export function AttentionTab({ onOpenEvent }: { onOpenEvent: (eventId: string) => void }) {
    const [view, setView] = useState<'new' | 'done'>('new');
    const flags = useQuery({
        queryKey: ['audit', 'flags', view],
        queryFn: () => fetchFlags(new URLSearchParams({ status: view === 'new' ? 'new' : 'all' })),
    });
    const items = (flags.data?.results ?? []).filter((f) => (view === 'new' ? f.status === 'new' : f.status !== 'new'));

    return (
        <div>
            <div className="mb-3 inline-flex rounded-md border p-0.5 text-sm" role="group" aria-label="Show">
                {([['new', 'Needs a look'], ['done', 'Already looked at']] as const).map(([v, label]) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                        className={cn('rounded px-3 py-1', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
                ))}
            </div>
            {flags.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
            {!!flags.error && <p role="alert" className="text-sm text-destructive">{apiErrorMessage(flags.error)}</p>}
            {!flags.isLoading && !flags.error && items.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
                    <ShieldCheck className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                    <p className="text-sm font-medium">{view === 'new' ? 'Nothing needs your attention' : 'Nothing has been looked at yet'}</p>
                    {view === 'new' && <p className="max-w-sm text-xs text-muted-foreground">When something unusual happens (many cancelled bills, big write-offs, a new admin) it will show up here with the reason.</p>}
                </div>
            )}
            <div className="space-y-3">{items.map((f) => <FlagCard key={f.id} flag={f} onOpenEvent={onOpenEvent} />)}</div>
        </div>
    );
}
