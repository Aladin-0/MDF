'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/shared/ModalShell';
import { InvoiceViewer } from '@/components/stockledger/InvoiceViewer';
import { SEVERITY, dateTimeText, valueText, type AuditEvent } from '@/lib/audit';
import { fetchEvent } from '@/lib/auditApi';
import { formatCurrency } from '@/lib/gst';
import { useState } from 'react';
import { cn } from '@/lib/utils';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[7rem_1fr] gap-2 py-1 text-sm">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground pt-0.5">{label}</dt>
            <dd className="min-w-0 break-words">{children}</dd>
        </div>
    );
}

/** Everything about one event: who, when, from where, exactly what changed (before and after), why it was flagged, and the record's other events. */
export function EventDetail({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
    const [invoice, setInvoice] = useState<{ kind: 'sale' | 'purchase'; id: string } | null>(null);
    const full = useQuery({ queryKey: ['audit', 'event', event.id], queryFn: () => fetchEvent(event.id), staleTime: 60_000 });
    const e = full.data ?? event;
    const viewer = e.entity.viewer && e.entity.viewer.kind ? (e.entity.viewer as { kind: 'sale' | 'purchase'; id: string }) : null;

    return (
        <>
            <ModalShell open onClose={onClose} title="What happened" size="lg" footer={<Button type="button" variant="outline" className="flex-1" onClick={onClose}>Close</Button>}>
                <p className="text-base font-medium">{e.summary}</p>
                <dl className="mt-3 divide-y">
                    <Row label="When">{dateTimeText(e.occurredAt)}</Row>
                    <Row label="Who">{e.actor.name || 'System'}{e.actor.role ? <span className="text-muted-foreground"> · {e.actor.role.replace('_', ' ')}</span> : null}</Row>
                    {e.outlet && <Row label="Shop">{e.outlet}</Row>}
                    {e.entity.label && (
                        <Row label="Record">
                            {e.entity.label}
                            {viewer && (
                                <button type="button" onClick={() => setInvoice(viewer)} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline">
                                    Open {viewer.kind === 'sale' ? 'bill' : 'purchase'} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </button>
                            )}
                        </Row>
                    )}
                    {e.amount !== null && <Row label="Amount">{formatCurrency(e.amount)}</Row>}
                    {e.reason && <Row label="Reason">{e.reason}</Row>}
                    <Row label="From">
                        {[e.device, e.ip].filter(Boolean).join(' · ') || '—'}
                        {e.insideNetwork === true && <span className="ml-2 text-xs text-emerald-700">on the shop network</span>}
                        {e.insideNetwork === false && <span className="ml-2 text-xs text-amber-700">away from the shop network</span>}
                    </Row>
                </dl>

                {e.changes.length > 0 && (
                    <section className="mt-4" aria-label="What changed">
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">What changed</h3>
                        <div className="overflow-x-auto rounded border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-2 py-1 text-left font-medium">Field</th><th className="px-2 py-1 text-left font-medium">Before</th><th className="px-2 py-1 text-left font-medium">After</th></tr></thead>
                                <tbody>
                                    {e.changes.map((c) => (
                                        <tr key={c.field} className="border-t">
                                            <td className="px-2 py-1 font-medium">{c.label}</td>
                                            <td className="px-2 py-1 text-muted-foreground break-words">{valueText(c.before)}</td>
                                            <td className="px-2 py-1 break-words">{valueText(c.after)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {e.flags.length > 0 && (
                    <section className="mt-4" aria-label="Why this was flagged">
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Why this was flagged</h3>
                        <ul className="space-y-1">
                            {e.flags.map((f) => (
                                <li key={f.id} className={cn('rounded border px-2 py-1.5 text-sm', SEVERITY[f.severity].chip)}>
                                    <span className="font-medium">{SEVERITY[f.severity].label}.</span> {f.title}
                                    {f.status !== 'new' && <span className="ml-1 text-xs opacity-70">({f.status === 'reviewed' ? 'reviewed' : 'marked not a problem'})</span>}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {(full.isLoading || (full.data?.related?.length ?? 0) > 0) && (
                    <section className="mt-4" aria-label="Other events on this record">
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Other events on this record</h3>
                        {full.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /> : (
                            <ul className="divide-y rounded border text-sm">
                                {full.data!.related!.map((r) => (
                                    <li key={r.id} className="px-2 py-1.5"><span className="text-xs text-muted-foreground mr-2">{dateTimeText(r.occurredAt)}</span>{r.summary}</li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </ModalShell>
            {invoice && <InvoiceViewer target={invoice} onClose={() => setInvoice(null)} />}
        </>
    );
}
