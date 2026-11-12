import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { cn, formatQty } from '@/lib/utils';
import { formatCurrency } from '@/lib/gst';
import { daysUntil, expiryTone, formatDay } from '@/lib/dates';
import { expiryText } from '@/lib/inventory';
import type { Batch, ProductSearchResult } from '@/types';

interface BatchBreakdownProps {
    product: ProductSearchResult;
    onAdjust: (batch: Batch, product: ProductSearchResult) => void;
}

/** The batches of one product, shown under its row. Each can be adjusted on its own (the row's own button used to pick the first batch for you). */
export function BatchBreakdown({ product, onAdjust }: BatchBreakdownProps) {
    return (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Batches of {product.name}</caption>
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                    <th scope="col" className="pb-2 pr-4 font-medium">Batch</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">In stock</th>
                    <th scope="col" className="pb-2 pr-4 font-medium">Expiry</th>
                    <th scope="col" className="pb-2 pr-4 font-medium">Rack</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">Landing</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">MRP</th>
                    <th scope="col" className="pb-2 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
            </thead>
            <tbody className="divide-y">
                {product.batches.map((batch) => {
                    const days = batch.expiryDate ? daysUntil(batch.expiryDate) : null;
                    const tone = batch.expiryDate ? expiryTone(batch.expiryDate) : 'ok';
                    const empty = batch.qtyStrips === 0 && batch.qtyLoose === 0;
                    return (
                        <tr key={batch.id || batch.batchNo} className={cn(empty && 'text-muted-foreground')}>
                            <td className="py-2 pr-4"><span translate="no" className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{batch.batchNo}</span></td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                                {empty ? 'Empty' : formatQty(batch.qtyStrips, batch.qtyLoose, batch.packSize, batch.packType, batch.packUnit)}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                                {batch.expiryDate ? (
                                    <>
                                        {formatDay(batch.expiryDate)}
                                        {!empty && days !== null && tone !== 'ok' && (
                                            <span className={cn('ml-2 text-xs font-medium', tone === 'expired' ? 'text-destructive' : 'text-amber-700')}>{expiryText(days)}</span>
                                        )}
                                    </>
                                ) : '—'}
                            </td>
                            <td className="py-2 pr-4">{batch.rackLocation || '—'}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(batch.landingRate || batch.purchaseRate)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(batch.mrp)}</td>
                            <td className="py-2 text-right">
                                <PermissionGate permission="adjust_stock">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onAdjust(batch, product)}
                                        aria-label={`Adjust stock of batch ${batch.batchNo}`}
                                    >
                                        <SlidersHorizontal aria-hidden="true" /> Adjust
                                    </Button>
                                </PermissionGate>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}
