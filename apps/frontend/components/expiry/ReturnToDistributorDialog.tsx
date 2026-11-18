'use client';

import Link from 'next/link';
import { ArrowUpRight, Info } from 'lucide-react';
import { ModalShell, ModalSection } from '@/components/shared/ModalShell';
import { Button } from '@/components/ui/button';
import { returnGroups, returnHref, stockText, type ExpiryRow } from '@/lib/expiryManager';

/**
 * A return to the distributor is a debit note made against ONE purchase invoice, so the ticked batches are grouped by the
 * invoice that brought them in. Each group opens the existing purchase-return screen with only those batches. Nothing is
 * saved here: stock changes when the debit note is saved there.
 */
export function ReturnToDistributorDialog({ rows, onClose }: { rows: ExpiryRow[]; onClose: () => void }) {
    const { groups, cannotReturn } = returnGroups(rows);
    return (
        <ModalShell open onClose={onClose} title="Return to distributor" size="lg" footer={<Button type="button" variant="outline" className="flex-1" onClick={onClose}>Close</Button>}>
            <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                A return is a debit note against one purchase invoice, so your batches are grouped by invoice. Open each one, check the quantities, and save it there. Stock is reduced when you save the note.
            </p>

            {groups.length > 0 && (
                <ModalSection title={`${groups.length} ${groups.length === 1 ? 'debit note' : 'debit notes'} to make`}>
                    <ul className="divide-y rounded-md border">
                        {groups.map((g) => (
                            <li key={g.invoiceId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{g.distributorName}</p>
                                    <p className="text-xs text-muted-foreground">Invoice {g.invoiceNo} · {g.rows.length} {g.rows.length === 1 ? 'batch' : 'batches'}</p>
                                    <p className="mt-1 break-words text-xs text-muted-foreground">{g.rows.map((r) => `${r.productName} ${r.batchNo} (${stockText(r)})`).join(' · ')}</p>
                                </div>
                                <Button asChild size="sm"><Link href={returnHref(g)}>Make debit note <ArrowUpRight aria-hidden="true" /></Link></Button>
                            </li>
                        ))}
                    </ul>
                </ModalSection>
            )}

            {cannotReturn.length > 0 && (
                <ModalSection title="Cannot be returned from here">
                    <p className="mb-2 text-sm text-muted-foreground">These have no purchase record (opening stock or an unposted invoice), so there is no invoice to return them against. You can still remove them from stock.</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm">
                        {cannotReturn.map((r) => <li key={r.id}>{r.productName} <span className="font-mono text-xs">{r.batchNo}</span></li>)}
                    </ul>
                </ModalSection>
            )}
        </ModalShell>
    );
}
