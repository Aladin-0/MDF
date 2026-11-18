'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalSection, ModalShell } from '@/components/shared/ModalShell';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { fetchLedgerHealth, repairLedger } from '@/lib/stockLedgerApi';
import { formatCount, formatInr, type LedgerHealth as Health } from '@/lib/stockLedger';

const SAFE: (keyof Health['counts'])[] = ['A', 'B', 'R'];
const DECISION: (keyof Health['counts'])[] = ['B2', 'C'];

/** The query the banner and the dialog share. Managers only (the endpoint is manager+). */
export function useLedgerHealth(outletId: string, enabled: boolean) {
    return useQuery({ queryKey: ['stock-ledger-health', outletId], queryFn: ({ signal }) => fetchLedgerHealth(outletId, signal), enabled: enabled && !!outletId, staleTime: 60_000 });
}

/** "N batches have an incomplete history": shown to managers only when there is something to say. */
export function LedgerHealthBanner({ health, onOpen }: { health: Health | undefined; onOpen: () => void }) {
    const n = health ? health.safeToRepair + health.needsDecision : 0;
    if (!health || n === 0) return null;
    return (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 sm:p-4">
            <p className="flex min-w-0 items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span><strong>{formatCount(n)} {n === 1 ? 'batch has' : 'batches have'} an incomplete history.</strong> Their running balances can look wrong or even negative. Your stock itself is not affected.</span></p>
            <Button type="button" size="sm" variant="outline" className="bg-background" onClick={onOpen}>See what can be done</Button>
        </div>
    );
}

export function LedgerHealthDialog({ health, outletId, onClose }: { health: Health; outletId: string; onClose: () => void }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const repair = useMutation({
        mutationFn: () => repairLedger(outletId, password),
        onSuccess: async (r) => {
            await queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
            await queryClient.invalidateQueries({ queryKey: ['stock-ledger-health'] });
            toast({ title: `${formatCount(r.total)} ${r.total === 1 ? 'batch' : 'batches'} repaired`, description: 'Opening balances were added to their history. No stock and no profit figure changed.' });
            onClose();
        },
        onError: (e: any) => { setError(apiErrorMessage(e, 'Nothing was changed. Try again.')); if (e?.error?.code === 'WRONG_PASSWORD') setPassword(''); },
    });

    return (
        <ModalShell open onClose={repair.isPending ? () => {} : onClose} title="Incomplete stock history" size="lg"
            footer={health.canRepair && health.safeToRepair > 0 ? (
                <>
                    <Button type="button" className="flex-1" disabled={repair.isPending || password.length === 0} onClick={() => { setError(null); repair.mutate(); }}>
                        {repair.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                        {repair.isPending ? 'Repairing…' : `Add the missing opening balances (${formatCount(health.safeToRepair)})`}
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose} disabled={repair.isPending}>Cancel</Button>
                </>
            ) : <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Close</Button>}>
            <p className="text-sm text-muted-foreground">
                The stock ledger is the record of every movement of a batch. Stock that was imported without an opening balance has no starting point, so the first sale
                drives its balance below zero. The stock each batch holds is correct and billing uses it; only this history is incomplete.
            </p>
            <ModalSection title="What was found">
                <ul className="divide-y rounded-md border text-sm">
                    {[...SAFE, ...DECISION].filter((k) => health.counts[k] > 0).map((k) => (
                        <li key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span>{health.labels[k]}</span>
                            <span className="flex items-center gap-2"><span className="tabular-nums font-medium">{formatCount(health.counts[k])}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${SAFE.includes(k) ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{SAFE.includes(k) ? 'can be repaired' : 'needs a decision'}</span></span>
                        </li>
                    ))}
                </ul>
            </ModalSection>
            {health.safeToRepair > 0 && (
                <ModalSection title="Add the missing opening balances">
                    <p className="text-sm text-muted-foreground">
                        Adds one opening-balance line to each of those batches, dated when the batch was created. <strong className="text-foreground">It changes no stock and no profit figure</strong>:
                        the lines are recorded as ledger repairs, not as Opening Stock in your accounts. (Booking them as Opening Stock would add {formatInr(health.openingStockIfBookedAsOpening)} to the
                        P&amp;L&apos;s Opening Stock. That is an accounting decision for you and your accountant, and is not done here.)
                    </p>
                    {health.canRepair ? (
                        <div className="mt-3">
                            <Label htmlFor="repair-password" className="text-xs">Your password (the one you signed in with)</Label>
                            <Input id="repair-password" name="confirm-secret" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                                style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} className="max-w-sm" value={password} aria-invalid={!!error || undefined}
                                onChange={(e) => { setPassword(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && password) { e.preventDefault(); setError(null); repair.mutate(); } }} />
                            {error && <Alert variant="destructive" className="mt-3" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
                        </div>
                    ) : <p className="mt-2 text-sm font-medium">Only an admin can do this. Ask your admin to open this page.</p>}
                </ModalSection>
            )}
            {health.needsDecision > 0 && (
                <ModalSection title="Not changed here">
                    <p className="text-sm text-muted-foreground">
                        {formatCount(health.needsDecision)} {health.needsDecision === 1 ? 'batch has' : 'batches have'} a ledger total that disagrees with the stock the batch holds (for example stock added or removed by an import,
                        outside the ledger). Correcting them records a movement dated today, so it is left for you to decide. Your developer can list them with <code className="rounded bg-muted px-1 text-xs">manage.py repair_stock_ledger</code>.
                    </p>
                </ModalSection>
            )}
        </ModalShell>
    );
}
