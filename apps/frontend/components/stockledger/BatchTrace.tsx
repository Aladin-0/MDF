'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { formatDay } from '@/lib/dates';
import { downloadBatchTrace, fetchBatchTrace } from '@/lib/stockLedgerApi';
import { packsText, type InvoiceRef, type PackInfo } from '@/lib/stockLedger';
import { cn } from '@/lib/utils';

const SHOWN = 25;

/**
 * "Who got this batch": every sale out of it (invoice, customer, the person it was for, quantity), the purchases that brought it
 * in, and an Excel for a supplier recall, a drug inspector or a complaint. Loaded only when opened.
 */
export function BatchTrace({ outletId, batchId, batchNumber, pack, onOpenInvoice, canOpen }: { outletId: string; batchId: string; batchNumber: string; pack: PackInfo; onOpenInvoice?: (ref: InvoiceRef) => void; canOpen?: (kind: InvoiceRef['kind']) => boolean }) {
    const link = (ref: InvoiceRef) => (onOpenInvoice && (!canOpen || canOpen(ref.kind)) ? () => onOpenInvoice(ref) : undefined);
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [all, setAll] = useState(false);
    const [exporting, setExporting] = useState(false);
    const trace = useQuery({ queryKey: ['batch-trace', outletId, batchId], queryFn: ({ signal }) => fetchBatchTrace(outletId, batchId, signal), enabled: open && !!outletId, staleTime: 30_000 });

    const exportIt = async () => {
        setExporting(true);
        try {
            await downloadBatchTrace(outletId, batchId, `batch-${batchNumber}-who-received-it.xlsx`);
            toast({ title: 'Export ready', description: 'The Excel file has been downloaded.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: apiErrorMessage(e, 'The file could not be created.') });
        } finally { setExporting(false); }
    };

    const t = trace.data;
    const sales = t ? (all ? t.sales : t.sales.slice(0, SHOWN)) : [];

    return (
        <div className="border-t pt-3">
            <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <Users aria-hidden="true" /> {open ? 'Hide who received this batch' : 'Who received this batch'}
            </Button>
            {open && (
                <div className="mt-3 space-y-3" aria-live="polite">
                    {trace.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Looking through the sales…</p>}
                    {trace.isError && <p role="alert" className="text-sm text-destructive">{apiErrorMessage(trace.error, 'Could not load the trace.')} <button type="button" className="underline" onClick={() => trace.refetch()}>Try again</button></p>}
                    {t && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-muted-foreground tabular-nums">
                                    {t.purchases.length > 0 ? `Bought ${packsText(t.totals.purchased_packs, pack)}` : 'No purchase record'} · sold {packsText(t.totals.sold_packs, pack)} to {t.salesCount} {t.salesCount === 1 ? 'bill' : 'bills'} · {t.totals.left_packs > 0 ? `${packsText(t.totals.left_packs, pack)} left` : 'none left'}
                                </p>
                                <Button type="button" size="sm" variant="outline" onClick={exportIt} disabled={exporting}>
                                    {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Export for a recall
                                </Button>
                            </div>
                            {t.purchases.length > 0 && (
                                <p className="text-sm">Came in: {t.purchases.map((p, i) => (
                                    <span key={p.invoice_id}>{i > 0 && '  |  '}{p.distributor || 'supplier'} · <InvoiceLink onOpen={link({ kind: 'purchase', id: p.invoice_id })}>invoice {p.invoice_no}</InvoiceLink> · {formatDay(p.date)} · {packsText(p.qty_packs, pack)}</span>
                                ))}</p>
                            )}
                            {t.sales.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has been sold from this batch.</p> : (
                                <>
                                    <ul className="divide-y rounded-md border text-sm" aria-label="Sales from this batch">
                                        {sales.map((s) => (
                                            <li key={`${s.invoice_id}-${s.date}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2">
                                                <div className="min-w-0">
                                                    <p className="font-medium">{s.customer}{s.patient && s.patient !== s.customer && <span className="font-normal text-muted-foreground"> · for {s.patient}</span>}</p>
                                                    <p className="text-xs text-muted-foreground tabular-nums">{formatDay(s.date)} · <InvoiceLink onOpen={link({ kind: 'sale', id: s.invoice_id })}>{s.invoice_no}</InvoiceLink>{s.customer_phone && ` · ${s.customer_phone}`}</p>
                                                </div>
                                                <p className={cn('whitespace-nowrap font-medium tabular-nums')}>{packsText(s.qty_packs, { ...pack, pack_size: s.pack_size || pack.pack_size })}{s.returned_packs > 0 && <span className="block text-xs font-normal text-muted-foreground">{packsText(s.returned_packs, pack)} returned</span>}</p>
                                            </li>
                                        ))}
                                    </ul>
                                    {t.sales.length > SHOWN && !all && <Button type="button" variant="link" className="h-auto p-0" onClick={() => setAll(true)}>Show all {t.sales.length}</Button>}
                                    {t.salesTruncated && <p className="text-xs text-muted-foreground">The first {t.sales.length} of {t.salesCount} bills are listed.</p>}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** An invoice number that opens the invoice when it can, plain text when it cannot. */
function InvoiceLink({ onOpen, children }: { onOpen?: () => void; children: React.ReactNode }) {
    if (!onOpen) return <>{children}</>;
    return <button type="button" onClick={onOpen} className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</button>;
}
