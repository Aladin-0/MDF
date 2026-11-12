import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatDecimalQty } from '@/lib/utils';
import {
    TONE_CLASSES,
    expiryTone,
    formatDay,
    formatInr,
    formatMonth,
    formatTime,
    toneForTxn,
    type LedgerEntry,
} from '@/lib/stockLedger';

interface LedgerTableProps {
    entries: LedgerEntry[];
    /** First load, nothing to show yet. */
    loading: boolean;
    /** Loading (announced to screen readers as busy). */
    fetching: boolean;
    /** Show the rows dimmed: only while the PREVIOUS rows stand in for what the user just asked for. */
    dimmed?: boolean;
    hasFilters: boolean;
    onClearFilters: () => void;
    /** Hidden when one batch is selected: the product is already named above the table. */
    showProduct: boolean;
}

function TxnBadge({ type, label }: { type: string; label: string }) {
    const tone = TONE_CLASSES[toneForTxn(type)];
    return (
        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', tone.badge)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
            {label}
        </span>
    );
}

const NUM = 'text-right tabular-nums';
// Phones: one DOM, restyled with CSS. Each movement row becomes a small 2-column card (no duplicate markup).
const CARD_CELL = 'max-md:p-0 max-md:text-left max-md:min-w-0';
const CARD_LABEL = 'max-md:before:mb-0.5 max-md:before:block max-md:before:text-[10px] max-md:before:font-medium max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]';

export function LedgerTable({ entries, loading, fetching, dimmed, hasFilters, onClearFilters, showProduct }: LedgerTableProps) {
    const columns = showProduct ? 9 : 8;

    return (
        // Our own scroll area (the shared <Table> wrapper would stop the header from sticking).
        <div className="max-h-[68dvh] max-md:max-h-none overflow-auto overscroll-contain" aria-busy={fetching}>
            <table className={cn('w-full caption-bottom text-sm transition-opacity max-md:block', dimmed && !loading && 'opacity-60')}>
                <caption className="sr-only">Stock movements, newest first</caption>
                <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur [&_tr]:border-b max-md:hidden">
                    <TableRow className="hover:bg-transparent">
                        <TableHead scope="col" className="h-10 whitespace-nowrap">Date</TableHead>
                        <TableHead scope="col" className="h-10">Type</TableHead>
                        <TableHead scope="col" className="h-10">Voucher</TableHead>
                        <TableHead scope="col" className="h-10">Party</TableHead>
                        {showProduct && <TableHead scope="col" className="h-10">Product &amp; Batch</TableHead>}
                        <TableHead scope="col" className={cn('h-10', NUM)}>In</TableHead>
                        <TableHead scope="col" className={cn('h-10', NUM)}>Out</TableHead>
                        <TableHead scope="col" className={cn('h-10', NUM)}>Rate</TableHead>
                        <TableHead scope="col" className={cn('h-10', NUM)}>Balance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="max-md:block">
                    {loading ? (
                        Array.from({ length: 8 }, (_, i) => (
                            <TableRow key={i} className="hover:bg-transparent max-md:block">
                                <TableCell colSpan={columns} className="max-md:block"><Skeleton className="h-9 w-full" /></TableCell>
                            </TableRow>
                        ))
                    ) : entries.length === 0 ? (
                        <TableRow className="hover:bg-transparent max-md:block">
                            <TableCell colSpan={columns} className="py-20 max-md:py-12 text-center max-md:block">
                                <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                                <p className="font-medium">{hasFilters ? 'No movements match your filters' : 'No stock movements in this period'}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {hasFilters ? 'Try removing a filter or widening the dates.' : 'Pick a longer date range to see earlier activity.'}
                                </p>
                                {hasFilters && (
                                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>Clear Filters</Button>
                                )}
                            </TableCell>
                        </TableRow>
                    ) : (
                        entries.map((e) => {
                            const exp = e.expiry_date ? expiryTone(e.expiry_date) : null;
                            return (
                                <TableRow key={e.id} className="max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:px-3 max-md:py-3">
                                    <TableCell className={cn('whitespace-nowrap', CARD_CELL)}>
                                        <div className="font-medium tabular-nums">{formatDay(e.txn_date)}</div>
                                        <div className="text-xs text-muted-foreground tabular-nums">{formatTime(e.created_at)}</div>
                                    </TableCell>
                                    <TableCell className="max-md:p-0 max-md:justify-self-end max-md:self-start"><TxnBadge type={e.txn_type} label={e.txn_type_label || e.txn_type} /></TableCell>
                                    <TableCell className={cn('whitespace-nowrap', CARD_CELL)}>
                                        <div translate="no" className="font-medium">{e.voucher_number || '—'}</div>
                                        <div className="text-xs text-muted-foreground">{e.voucher_type || 'System'}</div>
                                    </TableCell>
                                    <TableCell data-label="Party" className={cn('max-w-[10rem] max-md:max-w-none', CARD_CELL, CARD_LABEL)}>
                                        <span className="block truncate" title={e.party_name || undefined}>{e.party_name || '—'}</span>
                                    </TableCell>
                                    {showProduct && (
                                        <TableCell className={cn('max-w-[16rem] max-md:max-w-none max-md:col-span-2', CARD_CELL)}>
                                            <div className="truncate font-medium" title={e.product_name}>{e.product_name}</div>
                                            <div className="mt-0.5 flex items-center gap-2 text-xs">
                                                <span translate="no" className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">{e.batch_number}</span>
                                                {e.expiry_date && (
                                                    <span className={cn('whitespace-nowrap tabular-nums', exp === 'expired' ? 'font-medium text-destructive' : exp === 'soon' ? 'font-medium text-amber-700' : 'text-muted-foreground')}>
                                                        Exp&nbsp;{formatMonth(e.expiry_date)}{exp === 'expired' ? ' · Expired' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell data-label="In" className={cn(NUM, CARD_CELL, CARD_LABEL, 'max-md:border-t max-md:pt-2')}>
                                        {e.qty_in > 0 ? (
                                            <>
                                                <div className="font-semibold text-emerald-700">+{formatDecimalQty(e.qty_in, e.pack_size)}</div>
                                                <div className="text-xs text-muted-foreground">{formatInr(e.value_in)}</div>
                                            </>
                                        ) : <span className="text-muted-foreground/50" aria-label="None">—</span>}
                                    </TableCell>
                                    <TableCell data-label="Out" className={cn(NUM, CARD_CELL, CARD_LABEL, 'max-md:border-t max-md:pt-2')}>
                                        {e.qty_out > 0 ? (
                                            <>
                                                <div className="font-semibold text-rose-700">−{formatDecimalQty(e.qty_out, e.pack_size)}</div>
                                                <div className="text-xs text-muted-foreground">{formatInr(e.value_out)}</div>
                                            </>
                                        ) : <span className="text-muted-foreground/50" aria-label="None">—</span>}
                                    </TableCell>
                                    <TableCell data-label="Rate" className={cn(NUM, 'text-muted-foreground', CARD_CELL, CARD_LABEL)}>{formatInr(e.rate)}</TableCell>
                                    <TableCell data-label="Balance" className={cn(NUM, CARD_CELL, CARD_LABEL)}>
                                        <div className="whitespace-nowrap font-semibold">{formatDecimalQty(e.running_qty, e.pack_size)}</div>
                                        <div className="text-xs text-muted-foreground">{formatInr(e.running_value)}</div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </table>
        </div>
    );
}
