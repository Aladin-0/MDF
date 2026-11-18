'use client';

import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEVERITY, timeText, worstFlag, type AuditEvent } from '@/lib/audit';
import { formatCurrency } from '@/lib/gst';

/** One line of the activity feed: when, a severity dot, the sentence, and what kind of thing it was. Tapping opens the details. */
export function EventRow({ event, onOpen }: { event: AuditEvent; onOpen: (e: AuditEvent) => void }) {
    const flag = worstFlag(event.flags);
    const sev = SEVERITY[flag?.severity ?? event.severity];
    return (
        <button
            type="button"
            onClick={() => onOpen(event)}
            className="w-full text-left flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none border-b last:border-b-0"
        >
            <span className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{timeText(event.occurredAt)}</span>
            <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', sev.dot)} />
            <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground break-words">{event.summary}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{event.categoryLabel}</span>
                    {event.outlet && <span>· {event.outlet}</span>}
                    {event.device && <span>· {event.device}</span>}
                    {event.insideNetwork === false && <span className="text-amber-700">· away from the shop network</span>}
                </span>
                {flag && (
                    <span className={cn('mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium', sev.chip)}>
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        {SEVERITY[flag.severity].label}: {flag.title}
                    </span>
                )}
            </span>
            {event.amount !== null && <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums">{formatCurrency(event.amount)}</span>}
        </button>
    );
}
