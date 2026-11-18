'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { apiErrorMessage } from '@/lib/apiError';
import { removeExpiryStock, type RemoveResult } from '@/lib/expiryApi';
import {
    REMOVAL_TYPES, buildRemovePayload, removalCost, removalProblem, stockText, wholeBatch,
    type ExpiryRow, type RemovalQty, type RemovalType,
} from '@/lib/expiryManager';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { DaysBadge } from './ExpiryList';

interface Props {
    rows: ExpiryRow[];
    outletId: string;
    onClose: () => void;
    onDone: (result: RemoveResult) => void;
}

/** Writes the chosen batches off in one go. All or nothing: if any batch is refused, no stock changes. */
export function RemoveStockDialog({ rows, outletId, onClose, onDone }: Props) {
    const allExpired = rows.every((r) => r.daysToExpiry < 0);
    const [type, setType] = useState<RemovalType>(allExpired ? 'EXPIRED' : 'DAMAGED');
    const [reason, setReason] = useState('');
    const [password, setPassword] = useState('');
    const [qty, setQty] = useState<Record<string, RemovalQty>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ message: string; batchId?: string; password?: boolean } | null>(null);

    const q = (r: ExpiryRow) => qty[r.id] ?? wholeBatch();
    const problems = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, removalProblem(r, qty[r.id] ?? wholeBatch())])), [rows, qty]);
    const hasProblem = Object.values(problems).some(Boolean);
    const notExpired = rows.filter((r) => r.daysToExpiry >= 0).length;
    const cost = removalCost(rows, qty);
    const canSubmit = !busy && !hasProblem && password.length > 0 && rows.length > 0;

    const edit = (r: ExpiryRow, patch: Partial<RemovalQty>) => setQty((m) => ({ ...m, [r.id]: { ...(m[r.id] ?? wholeBatch()), ...patch } }));

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true); setError(null);
        try {
            onDone(await removeExpiryStock(outletId, buildRemovePayload(rows, qty, { type, reason, password })));
        } catch (e: any) {
            const code = e?.error?.code;
            setError({ message: apiErrorMessage(e, 'Nothing was removed. Try again.'), batchId: e?.error?.batchId, password: code === 'WRONG_PASSWORD' || code === 'PASSWORD_REQUIRED' || code === 'TOO_MANY_ATTEMPTS' });
            if (code === 'WRONG_PASSWORD') { setPassword(''); document.getElementById('remove-password')?.focus(); }
        } finally {
            setBusy(false);
        }
    };

    return (
        <ModalShell open onClose={busy ? () => {} : onClose} title="Remove from stock" size="lg"
            footer={(
                <>
                    <Button type="button" variant="destructive" className="flex-1" onClick={submit} disabled={!canSubmit}>
                        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                        {busy ? 'Removing…' : `Remove ${rows.length} ${rows.length === 1 ? 'batch' : 'batches'} from stock`}
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                </>
            )}>
            <p className="text-sm text-muted-foreground">
                Takes the stock of these batches off your shelves and records it as a stock adjustment (ledger, GST write-off and audit trail).
                It is all or nothing: if one batch is refused, nothing changes. To put stock back later, use Adjust on the product.
            </p>

            <ModalSection title="Why">
                <div role="radiogroup" aria-label="Reason for removal" className="grid grid-cols-3 gap-2">
                    {REMOVAL_TYPES.map((t) => (
                        <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => setType(t.value)}
                            className={cn('h-10 rounded-md border text-sm font-medium', type === t.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>{t.label}</button>
                    ))}
                </div>
                <div className="mt-3">
                    <Label htmlFor="remove-note" className="text-xs">Note (optional)</Label>
                    <Input id="remove-note" name="removal-note" value={reason} maxLength={200} autoComplete="off" onChange={(e) => setReason(e.target.value)} placeholder="e.g. Past date, thrown away" />
                </div>
            </ModalSection>

            <ModalSection title={`Batches (${rows.length})`}>
                {notExpired > 0 && (
                    <p role="status" className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {notExpired} of these {notExpired === 1 ? 'has' : 'have'} not expired yet. Check the dates before you continue.
                    </p>
                )}
                <ul className="max-h-[40dvh] divide-y overflow-y-auto rounded-md border">
                    {rows.map((r) => {
                        const c = q(r);
                        const own = error?.batchId === r.id;
                        return (
                            <li key={r.id} className={cn('space-y-1.5 p-3', own && 'bg-red-50')}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="break-words text-sm font-medium">{r.productName}</p>
                                        <p className="text-xs text-muted-foreground"><span className="font-mono">{r.batchNo}</span> · {r.distributorName || 'No purchase record'}</p>
                                    </div>
                                    <DaysBadge days={r.daysToExpiry} />
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                                    {c.custom ? (
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor={`rs-${r.id}`} className="sr-only">Strips to remove from batch {r.batchNo}</Label>
                                            <Input id={`rs-${r.id}`} inputMode="numeric" className="h-9 w-20 text-right" value={c.strips} placeholder="0" onChange={(e) => edit(r, { strips: e.target.value })} aria-invalid={problems[r.id] ? true : undefined} />
                                            <span className="text-xs text-muted-foreground">{r.packType}{r.packSize > 1 ? 's' : ''} +</span>
                                            <Label htmlFor={`rl-${r.id}`} className="sr-only">Loose units to remove from batch {r.batchNo}</Label>
                                            <Input id={`rl-${r.id}`} inputMode="numeric" className="h-9 w-20 text-right" value={c.loose} placeholder="0" onChange={(e) => edit(r, { loose: e.target.value })} aria-invalid={problems[r.id] ? true : undefined} />
                                            <span className="text-xs text-muted-foreground">loose</span>
                                            <button type="button" className="text-xs text-primary underline" onClick={() => edit(r, { custom: false })}>All of it</button>
                                        </div>
                                    ) : (
                                        <>
                                            <span>Remove <strong className="tabular-nums">all: {stockText(r)}</strong></span>
                                            <button type="button" className="text-xs text-primary underline" onClick={() => edit(r, { custom: true, strips: String(r.qtyStrips), loose: String(r.qtyLoose) })}>Change quantity</button>
                                        </>
                                    )}
                                </div>
                                {problems[r.id] && <p role="alert" className="text-xs font-medium text-destructive">{problems[r.id]}</p>}
                                {own && !problems[r.id] && <p role="alert" className="text-xs font-medium text-destructive">{error!.message}</p>}
                            </li>
                        );
                    })}
                </ul>
                {cost !== undefined && <p className="mt-2 text-sm">Cost written off: <strong className="tabular-nums">{formatCurrency(cost)}</strong></p>}
            </ModalSection>

            <ModalSection title="Confirm">
                <Label htmlFor="remove-password" className="text-xs">Your password (the one you signed in with)</Label>
                {/* masked text, NOT type=password: Chrome's password manager treated the Note box as the "username" and filled it with a phone number */}
                <Input id="remove-password" name="confirm-secret" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} className="max-w-sm" value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error?.password) setError(null); }}
                    aria-invalid={error?.password || undefined} aria-describedby={error?.password ? 'remove-password-error' : undefined}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }} />
                {error?.password && <p id="remove-password-error" role="alert" className="mt-1.5 text-sm font-medium text-destructive">{error.message}</p>}
                {error && !error.batchId && !error.password && (
                    <Alert variant="destructive" className="mt-3" role="alert"><AlertDescription>{error.message}</AlertDescription></Alert>
                )}
            </ModalSection>
        </ModalShell>
    );
}
