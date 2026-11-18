'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ModalSection, ModalShell } from '@/components/shared/ModalShell';
import { apiErrorMessage } from '@/lib/apiError';
import { assignBatchSupplier, type AssignResult } from '@/lib/expiryApi';
import { splitForAssignment, type ExpiryRow } from '@/lib/expiryManager';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
    rows: ExpiryRow[];
    outletId: string;
    distributors: { id: string; name: string }[];
    onClose: () => void;
    onDone: (result: AssignResult) => void;
}

/**
 * Say who supplied stock that has no purchase invoice (opening stock). The distributor filter and the return flow need it.
 * Batches that came in through a posted purchase keep their invoice's supplier: an invoice is evidence, a click is not.
 */
export function AssignSupplierDialog({ rows, outletId, distributors, onClose, onDone }: Props) {
    const { can, cannot } = splitForAssignment(rows);
    const [pick, setPick] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sorted = [...distributors].sort((a, b) => a.name.localeCompare(b.name));

    const submit = async (clear: boolean) => {
        if (busy || can.length === 0 || (!clear && !pick)) return;
        setBusy(true); setError(null);
        try { onDone(await assignBatchSupplier(outletId, can.map((r) => r.id), clear ? null : pick)); }
        catch (e) { setError(apiErrorMessage(e, 'Nothing was changed. Try again.')); }
        finally { setBusy(false); }
    };

    return (
        <ModalShell open onClose={busy ? () => {} : onClose} title="Assign a distributor" size="md"
            footer={(
                <>
                    <Button type="button" className="flex-1" onClick={() => submit(false)} disabled={busy || can.length === 0 || !pick}>
                        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                        {busy ? 'Saving…' : `Assign to ${can.length} ${can.length === 1 ? 'batch' : 'batches'}`}
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                </>
            )}>
            <p className="text-sm text-muted-foreground">
                Stock with no purchase invoice (opening stock) has no known supplier, so it cannot be filtered or sent back by distributor. Say who supplied it.
                This changes only the supplier. It does not touch stock, prices or the ledger.
            </p>
            <ModalSection title="Distributor">
                <Label htmlFor="assign-distributor" className="sr-only">Distributor</Label>
                <select id="assign-distributor" value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy || can.length === 0}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Choose a distributor…</option>
                    {sorted.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {can.some((r) => r.distributorId) && (
                    <p className="mt-2 text-sm text-muted-foreground">
                        {can.filter((r) => r.distributorId).length} of these already have an assigned supplier; choosing one replaces it.{' '}
                        <button type="button" className="text-primary underline" onClick={() => submit(true)} disabled={busy}>Clear it instead</button>
                    </p>
                )}
            </ModalSection>
            <ModalSection title="What it will change">
                <p className="text-sm"><strong>{can.length}</strong> {can.length === 1 ? 'batch' : 'batches'} can be assigned.</p>
                {cannot.length > 0 && (
                    <p role="status" className="mt-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
                        {cannot.length} {cannot.length === 1 ? 'batch has' : 'batches have'} a purchase invoice, so {cannot.length === 1 ? 'its' : 'their'} supplier is the invoice&apos;s and is left alone:{' '}
                        {cannot.slice(0, 4).map((r) => `${r.productName} ${r.batchNo}`).join(', ')}{cannot.length > 4 ? ` and ${cannot.length - 4} more` : ''}.
                    </p>
                )}
                {can.length === 0 && <p className="mt-2 text-sm font-medium">None of the selected batches can be assigned.</p>}
                {error && <Alert variant="destructive" className="mt-3" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
            </ModalSection>
        </ModalShell>
    );
}
