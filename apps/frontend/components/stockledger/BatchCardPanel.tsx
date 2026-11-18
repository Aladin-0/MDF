import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { formatDay } from '@/lib/dates';
import { formatInr, expiryDayText, packsText, type BatchCard, type InvoiceRef } from '@/lib/stockLedger';
import { cn } from '@/lib/utils';
import { BatchTrace } from './BatchTrace';

/** One batch's identity: what it is, when it expires, what is left, who supplied it, and whether its history is complete. */
export function BatchCardPanel({ batch, outletId, onShowHealth, onOpenInvoice, canOpen }: { batch: BatchCard; outletId?: string; onShowHealth?: () => void; onOpenInvoice?: (ref: InvoiceRef) => void; canOpen?: (kind: InvoiceRef['kind']) => boolean }) {
    const expired = batch.days_to_expiry < 0;
    const incomplete = batch.ledger_state && batch.ledger_state !== 'OK';
    return (
        <section aria-label={`Batch ${batch.batch_number}`} className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch</p>
                    <h2 className="break-words text-lg font-semibold">
                        {batch.product_name} <span translate="no" className="font-mono text-base font-medium text-muted-foreground">{batch.batch_number}</span>
                    </h2>
                </div>
                {batch.product_id && (
                    <Link href={`/dashboard/inventory/${batch.product_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
                        Open the product <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <Fact label="In stock now" value={batch.qty_units > 0 ? packsText(batch.qty_packs, batch) : 'Nothing left'} strong />
                <Fact label="Expiry" value={<>{formatDay(batch.expiry_date)}<span className={cn('block text-xs font-medium', expired ? 'text-destructive' : batch.days_to_expiry <= 90 ? 'text-amber-700' : 'text-muted-foreground')}>{expiryDayText(batch.days_to_expiry)}</span></>} />
                <Fact label="MRP" value={formatInr(batch.mrp)} />
                <Fact label="Rack" value={batch.rack_location || '—'} />
                <div className="col-span-2 sm:col-span-4">
                    <dt className="text-xs text-muted-foreground">Supplied by</dt>
                    <dd className="font-medium">
                        {batch.supplier
                            ? <>{batch.supplier.distributor_name}<span className="font-normal text-muted-foreground">{batch.supplier.assigned ? ' · said by staff, no purchase invoice' : <> · {onOpenInvoice && batch.supplier.invoice_id && (!canOpen || canOpen('purchase')) ? <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onOpenInvoice({ kind: 'purchase', id: batch.supplier!.invoice_id! })}>invoice {batch.supplier.invoice_no}</button> : `invoice ${batch.supplier.invoice_no}`} · {batch.supplier.invoice_date ? formatDay(batch.supplier.invoice_date) : ''}{batch.supplier.more_suppliers ? ' · and other suppliers' : ''}</>}</span></>
                            : <span className="font-normal text-muted-foreground">No purchase record (opening stock or an unposted invoice)</span>}
                    </dd>
                </div>
            </dl>
            {incomplete && (
                <p role="status" className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{batch.ledger_state_label}. Balances below may look wrong for that reason, not because of a mistake in billing. {onShowHealth && <button type="button" onClick={onShowHealth} className="underline">What can be done</button>}</span>
                </p>
            )}
            {outletId && <BatchTrace outletId={outletId} batchId={batch.id} batchNumber={batch.batch_number} pack={batch} onOpenInvoice={onOpenInvoice} canOpen={canOpen} />}
        </section>
    );
}

function Fact({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
    return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn('tabular-nums', strong && 'text-base font-semibold')}>{value}</dd></div>;
}
