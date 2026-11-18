'use client';

import { Building2, Download, Loader2, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { formatCurrency } from '@/lib/gst';

interface Props {
    batches: number;
    costValue?: number;
    mrpValue: number;
    busy: 'export' | 'rows' | null;
    onExport: () => void;
    onAssign: () => void;
    onReturn: () => void;
    onRemove: () => void;
    onClear: () => void;
}

/**
 * Follows you down the page so the actions are always in reach however many rows there are.
 * Export is for everyone; returning and removing stock need `adjust_stock` (manager and above, what the API enforces).
 */
export function ExpiryActionBar({ batches, costValue, mrpValue, busy, onExport, onAssign, onReturn, onRemove, onClear }: Props) {
    return (
        <div role="region" aria-label="Actions for the selected batches" aria-live="polite"
            className="sticky bottom-3 z-20 rounded-xl border bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg sm:pb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{batches} {batches === 1 ? 'batch' : 'batches'} selected</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {costValue !== undefined ? `Cost ${formatCurrency(costValue)} · ` : ''}MRP value {formatCurrency(mrpValue)}
                    </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <Button type="button" variant="outline" onClick={onExport} disabled={busy !== null} className="max-sm:flex-1">
                        {busy === 'export' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Export
                    </Button>
                    <PermissionGate permission="edit_inventory">
                        <Button type="button" variant="outline" onClick={onAssign} disabled={busy !== null} className="max-sm:flex-1">
                            {busy === 'rows' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Building2 aria-hidden="true" />} Assign distributor
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="adjust_stock">
                        <Button type="button" variant="outline" onClick={onReturn} disabled={busy !== null} className="max-sm:flex-1">
                            {busy === 'rows' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Undo2 aria-hidden="true" />} Return to distributor
                        </Button>
                        <Button type="button" variant="destructive" onClick={onRemove} disabled={busy !== null} className="max-sm:flex-1">
                            <Trash2 aria-hidden="true" /> Remove from stock
                        </Button>
                    </PermissionGate>
                    <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label="Clear selection" className="h-9 w-9"><X aria-hidden="true" /></Button>
                </div>
            </div>
        </div>
    );
}
