'use client';

import { useState } from 'react';
import { Pencil, SlidersHorizontal, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PermissionGate } from '@/components/shared/PermissionGate';
import { usePermissions } from '@/hooks/usePermissions';
import { daysUntil, formatDay, formatMonth } from '@/lib/dates';
import { formatCurrency } from '@/lib/gst';
import { batchValue, expiryText } from '@/lib/inventory';
import { batchState, type DetailBatch, type ProductMetrics } from '@/lib/productDetail';
import { cn, formatQty } from '@/lib/utils';
import { BatchGrid } from './BatchGrid';
import type { SaveResult } from './EditBatchModal';

const HEAD = 'h-9 px-3 text-xs font-medium';
const CELL = 'px-3 py-2';

interface ProductBatchTableProps {
    product: { name: string; packSize?: number; packType?: string; packUnit?: string; gstRate?: number; hsnCode?: string; scheduleType?: string; batches: DetailBatch[] };
    metrics: ProductMetrics;
    onAdjust: (batch: DetailBatch) => void;
    onEdit: (batch: DetailBatch) => void;
    /** Saves one batch (only the changed fields): used by the "Edit all batches" grid. */
    onSaveBatch?: (batchId: string, patch: Record<string, string | number | null>) => Promise<SaveResult | void>;
    /** Refreshes everything that shows these batches, once after a round of saves. */
    onSaved?: () => Promise<unknown> | void;
}

const STATE_ROW: Record<string, string> = {
    expired: 'bg-red-50/70 hover:bg-red-50',
    expiring: 'bg-amber-50/60 hover:bg-amber-50',
    empty: 'text-muted-foreground',
    ok: '',
};

export function ProductBatchTable({ product, metrics, onAdjust, onEdit, onSaveBatch, onSaved }: ProductBatchTableProps) {
    const { hasPermission } = usePermissions();
    const showRates = hasPermission('view_purchase_rates');
    const [gridOpen, setGridOpen] = useState(false);

    if (gridOpen && onSaveBatch) {
        return (
            <BatchGrid
                product={product}
                batches={product.batches}
                showRates={showRates}
                onSaveBatch={onSaveBatch}
                onSaved={onSaved ?? (() => undefined)}
                onExit={() => setGridOpen(false)}
            />
        );
    }

    return (
        <section aria-labelledby="batches-title" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-baseline gap-2">
                    <h2 id="batches-title" className="text-base font-semibold">Batches</h2>
                    <span className="text-sm text-muted-foreground tabular-nums">{product.batches.length}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">· FEFO: earliest expiry is sold first</span>
                </div>
                {onSaveBatch && product.batches.length > 0 && (
                    <PermissionGate permission="edit_inventory">
                        <Button type="button" variant="outline" size="sm" onClick={() => setGridOpen(true)}>
                            <Table2 aria-hidden="true" /> Edit all batches
                        </Button>
                    </PermissionGate>
                )}
            </div>

            <Card className="overflow-hidden">
                {/* its own scroll area: ten columns do not fit a narrow screen, and the page itself must not scroll sideways */}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] caption-bottom text-sm">
                        <caption className="sr-only">Batches of {product.name}, earliest expiry first</caption>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead scope="col" className={HEAD}>Batch</TableHead>
                                <TableHead scope="col" className={HEAD}>Expiry</TableHead>
                                <TableHead scope="col" className={cn(HEAD, 'text-right')}>In Stock</TableHead>
                                <TableHead scope="col" className={cn(HEAD, 'text-right')}>MRP</TableHead>
                                {showRates && (
                                    <>
                                        <TableHead scope="col" className={cn(HEAD, 'text-right')}>Purchase</TableHead>
                                        <TableHead scope="col" className={cn(HEAD, 'text-right')}>Landing</TableHead>
                                        <TableHead scope="col" className={cn(HEAD, 'text-right')}>Value</TableHead>
                                    </>
                                )}
                                <TableHead scope="col" className={HEAD}>Rack</TableHead>
                                <TableHead scope="col" className={cn(HEAD, 'w-36 max-md:sticky max-md:right-0 max-md:bg-muted')}><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {product.batches.map((b) => {
                                const state = batchState(b);
                                const days = daysUntil(b.expiryDate);
                                return (
                                    <TableRow key={b.id} className={cn('transition-colors', STATE_ROW[state])}>
                                        <TableCell className={CELL}>
                                            <span translate="no" className="font-mono font-medium">{b.batchNo}</span>
                                            {b.mfgDate && <span className="ml-2 text-xs text-muted-foreground">Mfg {formatMonth(b.mfgDate)}</span>}
                                        </TableCell>
                                        <TableCell className={cn(CELL, 'whitespace-nowrap tabular-nums')}>
                                            {formatDay(b.expiryDate)}
                                            {state !== 'empty' && (
                                                <span className={cn('ml-2 text-xs font-medium', state === 'expired' ? 'text-destructive' : state === 'expiring' ? 'text-amber-700' : 'text-muted-foreground')}>
                                                    {expiryText(days)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className={cn(CELL, 'whitespace-nowrap text-right font-medium tabular-nums')}>
                                            {state === 'empty' ? 'Empty' : formatQty(b.qtyStrips || 0, b.qtyLoose || 0, b.packSize || product.packSize || 1, product.packType, product.packUnit)}
                                        </TableCell>
                                        <TableCell className={cn(CELL, 'text-right tabular-nums')}>{formatCurrency(b.mrp)}</TableCell>
                                        {showRates && (
                                            <>
                                                <TableCell className={cn(CELL, 'text-right tabular-nums')}>{formatCurrency(b.purchaseRate)}</TableCell>
                                                <TableCell className={cn(CELL, 'text-right tabular-nums')}>{formatCurrency(b.landingRate ?? b.purchaseRate)}</TableCell>
                                                <TableCell className={cn(CELL, 'text-right font-medium tabular-nums')}>{formatCurrency(batchValue(b, 'LANDING', product.packSize || 1))}</TableCell>
                                            </>
                                        )}
                                        <TableCell className={CELL}>
                                            {b.rackLocation ? <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{b.rackLocation}</span> : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className={cn(CELL, 'text-right max-md:sticky max-md:right-0 max-md:bg-card max-md:shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.2)]')}>
                                            <div className="flex items-center justify-end gap-1">
                                                <PermissionGate permission="edit_inventory">
                                                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onEdit(b)} aria-label={`Edit batch ${b.batchNo}`}>
                                                        <Pencil aria-hidden="true" /> Edit
                                                    </Button>
                                                </PermissionGate>
                                                <PermissionGate permission="adjust_stock">
                                                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onAdjust(b)} aria-label={`Adjust stock of batch ${b.batchNo}`}>
                                                        <SlidersHorizontal aria-hidden="true" /> Adjust
                                                    </Button>
                                                </PermissionGate>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={2} className={cn(CELL, 'text-xs font-medium text-muted-foreground')}>Total</TableCell>
                                <TableCell className={cn(CELL, 'whitespace-nowrap text-right font-semibold tabular-nums')}>
                                    {metrics.packs === 0 ? '—' : formatQty(metrics.totalStrips, metrics.totalLoose, product.packSize || 1, product.packType, product.packUnit)}
                                </TableCell>
                                <TableCell className={CELL} />
                                {showRates && (
                                    <>
                                        <TableCell className={CELL} />
                                        <TableCell className={CELL} />
                                        <TableCell className={cn(CELL, 'text-right font-semibold tabular-nums')}>{formatCurrency(metrics.costValue)}</TableCell>
                                    </>
                                )}
                                <TableCell colSpan={2} className={CELL} />
                            </TableRow>
                        </TableFooter>
                    </table>
                </div>
            </Card>
        </section>
    );
}
