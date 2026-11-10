import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { POStatus } from '@/lib/poApi';

const STYLE: Record<POStatus, { label: string; cls: string }> = {
    SAVED: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    SENT: { label: 'Sent', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    PARTIAL: { label: 'Partial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    COMPLETED: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-white text-red-600 border-red-300' },
    EXPIRED: { label: 'Expired', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};

export const PO_STATUS_LABEL = (s: POStatus) => STYLE[s]?.label ?? s;

/** One status look used everywhere (list, detail, shortbook, public page). "SAVED" is shown as Draft. */
export function POStatusBadge({ status, className }: { status: POStatus; className?: string }) {
    const s = STYLE[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
    return <Badge variant="outline" className={cn('font-medium', s.cls, className)}>{s.label}</Badge>;
}
