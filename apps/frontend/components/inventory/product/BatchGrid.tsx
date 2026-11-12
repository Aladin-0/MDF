'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import { FIELD_LABELS, serverErrors, toForm, type BatchFormValues } from '@/lib/batchEdit';
import {
    changedRows, duplicateBatchNos, gridErrors, packSizesDiffer, parsePastedColumn, sellsBelowCost, touchesPackSize,
    GRID_FIELDS, type GridErrors, type GridField,
} from '@/lib/batchGrid';
import { formatCurrency } from '@/lib/gst';
import { batchState, type DetailBatch } from '@/lib/productDetail';
import { cn, formatQty } from '@/lib/utils';
import type { SaveResult } from './EditBatchModal';

type GridBatchRow = DetailBatch & { packType?: string | null; packUnit?: string | null };

interface BatchGridProps {
    product: { name: string; packSize?: number; packType?: string; packUnit?: string };
    batches: GridBatchRow[];
    /** Purchase and landing columns are only for people allowed to see purchase rates. */
    showRates: boolean;
    /** Saves ONE batch (only the changed fields). Resolves with the server's answer, rejects with its error. */
    onSaveBatch: (batchId: string, patch: Record<string, string | number | null>) => Promise<SaveResult | void>;
    /** Called once after a round of saves, to refresh everything that shows these batches. */
    onSaved: () => Promise<unknown> | void;
    onExit: () => void;
}

interface ColumnSpec { field: GridField; label: string; align: 'left' | 'right'; inputMode?: 'decimal' | 'numeric' | 'text'; type?: 'date'; width: string; ratesOnly?: boolean }

const COLUMNS: ColumnSpec[] = [
    { field: 'batchNo', label: 'Batch', align: 'left', width: 'w-40' },
    { field: 'expiryDate', label: 'Expiry', align: 'left', type: 'date', width: 'w-44' },
    { field: 'packSize', label: 'Pack size', align: 'right', inputMode: 'numeric', width: 'w-32' },
    { field: 'mrp', label: 'MRP', align: 'right', inputMode: 'decimal', width: 'w-28' },
    { field: 'purchaseRate', label: 'Purchase', align: 'right', inputMode: 'decimal', width: 'w-28', ratesOnly: true },
    { field: 'landingRate', label: 'Landing', align: 'right', inputMode: 'decimal', width: 'w-28', ratesOnly: true },
    { field: 'rackLocation', label: 'Rack', align: 'left', width: 'w-32' },
];

const SHOW_AS_MONEY: GridField[] = ['mrp', 'purchaseRate', 'landingRate'];
const was = (f: GridField, v: string) => (v === '' ? 'empty' : SHOW_AS_MONEY.includes(f) ? formatCurrency(Number(v)) : v);

const CELL_BASE = 'h-9 w-full rounded-sm border bg-transparent px-2 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30';

export function BatchGrid({ product, batches, showRates, onSaveBatch, onSaved, onExit }: BatchGridProps) {
    const { toast } = useToast();
    const root = useRef<HTMLDivElement>(null);
    const columns = COLUMNS.filter((c) => showRates || !c.ratesOnly);

    /** a draft exists only for rows someone touched; the others show the batch as it is */
    const [drafts, setDrafts] = useState<Record<string, BatchFormValues>>({});
    const [serverErr, setServerErr] = useState<Record<string, { fields: GridErrors; row?: string }>>({});
    const [busy, setBusy] = useState(false);
    const [packConfirmed, setPackConfirmed] = useState(false);
    const [showPackError, setShowPackError] = useState(false);

    const initials = useMemo(() => Object.fromEntries(batches.map((b) => [b.id, toForm(b)])), [batches]);
    const formOf = (id: string) => drafts[id] ?? initials[id];
    const rows = useMemo(() => changedRows(batches, drafts), [batches, drafts]);
    const dirtyIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
    const packChanged = touchesPackSize(rows);

    // problems in the rows being changed (live, so a bad cell is red as soon as it is typed), plus what the server refused
    const allForms = useMemo(() => Object.fromEntries(batches.map((b) => [b.id, formOf(b.id)])), [batches, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
    const duplicates = useMemo(() => duplicateBatchNos(allForms), [allForms]);
    const errorsOf = (id: string): GridErrors => {
        const live: GridErrors = dirtyIds.has(id) ? gridErrors(formOf(id), { showRates }) : {};
        if (duplicates.has(id) && !live.batchNo && dirtyIds.has(id)) live.batchNo = 'Another batch of this product has this number';
        return { ...(serverErr[id]?.fields ?? {}), ...live };
    };
    const problems = batches.flatMap((b) => Object.entries(errorsOf(b.id)).map(([field, message]) => ({ id: b.id, batchNo: initials[b.id].batchNo, field: field as GridField, message: message as string })));

    // leaving with unsaved changes loses them: ask the browser to confirm a reload or a closed tab
    useEffect(() => {
        if (rows.length === 0) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [rows.length]);

    // start in the first price cell: prices are what is edited most
    useEffect(() => {
        const first = root.current?.querySelector<HTMLInputElement>('[data-c="mrp"]');
        first?.focus();
    }, []);

    const setCell = (id: string, field: GridField, value: string) => {
        setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? initials[id]), [field]: value } }));
        if (serverErr[id]?.fields[field] || serverErr[id]?.row) {
            setServerErr((s) => ({ ...s, [id]: { fields: { ...s[id].fields, [field]: undefined }, row: undefined } }));
        }
    };

    const focusCell = (row: number, field: GridField) => {
        const el = root.current?.querySelector<HTMLInputElement>(`[data-r="${row}"][data-c="${field}"]`);
        if (el) { el.focus(); el.select?.(); }
        return !!el;
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, field: GridField) => {
        const isDate = field === 'expiryDate';
        if (e.key === 'Enter' || (!isDate && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
            e.preventDefault();
            const up = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey);
            focusCell(rowIndex + (up ? -1 : 1), field);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && rowIndex > 0) {
            e.preventDefault();                       // Excel's "fill down": the cell above
            setCell(batches[rowIndex].id, field, formOf(batches[rowIndex - 1].id)[field]);
        }
    };

    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, field: GridField) => {
        const column = parsePastedColumn(e.clipboardData.getData('text'));
        if (column.length === 0) return;             // one value: the normal paste into this cell
        e.preventDefault();
        column.forEach((value, i) => { const target = batches[rowIndex + i]; if (target) setCell(target.id, field, value); });
    };

    const discard = () => { setDrafts({}); setServerErr({}); setPackConfirmed(false); setShowPackError(false); onExit(); };

    const saveAll = async () => {
        if (busy || rows.length === 0) return;
        if (problems.length) {
            const first = problems[0];
            focusCell(batches.findIndex((b) => b.id === first.id), first.field);
            return;
        }
        if (packChanged && !packConfirmed) { setShowPackError(true); return; }

        setBusy(true);
        const outcome = await Promise.allSettled(rows.map((r) => onSaveBatch(r.id, r.patch)));
        const done = rows.filter((_, i) => outcome[i].status === 'fulfilled');
        const failed = rows.map((r, i) => ({ r, o: outcome[i] })).filter((x) => x.o.status === 'rejected') as { r: (typeof rows)[number]; o: PromiseRejectedResult }[];

        setDrafts((d) => { const next = { ...d }; done.forEach((r) => delete next[r.id]); return next; });
        setServerErr(Object.fromEntries(failed.map(({ r, o }) => {
            const fields = serverErrors(o.reason) as GridErrors;
            return [r.id, { fields, row: Object.keys(fields).length ? undefined : apiErrorMessage(o.reason, 'Not saved.') }];
        })));
        try { await onSaved(); } finally { setBusy(false); }

        const warnings = outcome.flatMap((o) => (o.status === 'fulfilled' ? (o.value as SaveResult | void)?.warnings ?? [] : []));
        if (done.length) {
            toast({
                title: failed.length ? `${done.length} saved, ${failed.length} not saved` : `${done.length} ${done.length === 1 ? 'batch' : 'batches'} updated`,
                variant: failed.length ? 'destructive' : undefined,
                description: [done.map((r) => `${r.label}: ${r.changes.map((c) => c.label).join(', ')}`).join(' · '), ...warnings].join('  '),
                duration: 12000,
                action: (
                    <ToastAction altText="Undo these changes" onClick={async () => {
                        const back = await Promise.allSettled(done.map((r) => onSaveBatch(r.id, r.undo)));
                        await onSaved();
                        const bad = back.filter((o) => o.status === 'rejected').length;
                        toast(bad ? { variant: 'destructive', title: 'Some changes could not be undone', description: 'Edit those batches again to put them back.' } : { title: 'Changes undone', description: 'The batches are back as they were.' });
                    }}>Undo</ToastAction>
                ),
            });
        } else {
            toast({ variant: 'destructive', title: 'Nothing was saved', description: 'Fix the highlighted cells and try again.' });
        }
        if (failed.length === 0) { setPackConfirmed(false); onExit(); }
    };

    const differ = packSizesDiffer(batches);

    return (
        <section aria-labelledby="batches-title" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="flex items-baseline gap-2">
                    <h2 id="batches-title" className="text-base font-semibold">Edit all batches</h2>
                    <span className="text-sm tabular-nums text-muted-foreground">{batches.length}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    <kbd className="rounded border bg-muted px-1">Tab</kbd> next cell · <kbd className="rounded border bg-muted px-1">Enter</kbd> / <kbd className="rounded border bg-muted px-1">↑↓</kbd> next row · <kbd className="rounded border bg-muted px-1">Ctrl+D</kbd> copy the cell above · paste a column from Excel
                </p>
            </div>

            {differ && (
                <p role="status" className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    These batches do not all have the same pack size (marked below). Fix each here, or use Edit Product to set one size for every batch.
                </p>
            )}

            <Card className="overflow-hidden">
                <div ref={root} className="overflow-x-auto">
                    <table className="w-full min-w-[56rem] border-collapse text-sm">
                        <caption className="sr-only">Editable batches of {product.name}. Each cell is a field; changed cells are highlighted.</caption>
                        <thead className="bg-muted/50">
                            <tr>
                                {columns.slice(0, 3).map((c) => <th key={c.field} scope="col" className={cn('h-9 px-2 text-xs font-medium', c.align === 'right' ? 'text-right' : 'text-left', c.width)}>{c.label}</th>)}
                                <th scope="col" className="h-9 px-3 text-right text-xs font-medium">In stock</th>
                                {columns.slice(3).map((c) => <th key={c.field} scope="col" className={cn('h-9 px-2 text-xs font-medium', c.align === 'right' ? 'text-right' : 'text-left', c.width)}>{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {batches.map((b, rowIndex) => {
                                const form = formOf(b.id);
                                const errs = errorsOf(b.id);
                                const rowDirty = dirtyIds.has(b.id);
                                const dirtyFields = new Set(rows.find((r) => r.id === b.id)?.changes.map((c) => c.field) ?? []);
                                const state = batchState(b);
                                const pack = Number(form.packSize) || 1;
                                // marked when it disagrees with the product's own pack size (else with the first batch)
                                const odd = differ && Number(initials[b.id].packSize) !== Number(product.packSize ?? batches[0]?.packSize ?? 1) && !rowDirty;

                                const cell = (c: ColumnSpec) => {
                                    const err = errs[c.field];
                                    const dirty = dirtyFields.has(c.field);
                                    const below = c.field === 'mrp' && sellsBelowCost(form);
                                    return (
                                        <td key={c.field} className="px-1 py-1 align-middle">
                                            <div className="relative">
                                                <input
                                                    data-r={rowIndex}
                                                    data-c={c.field}
                                                    type={c.type ?? 'text'}
                                                    inputMode={c.inputMode}
                                                    autoComplete="off"
                                                    spellCheck={false}
                                                    value={form[c.field]}
                                                    disabled={busy}
                                                    aria-label={`${FIELD_LABELS[c.field]} of batch ${initials[b.id].batchNo}`}
                                                    aria-invalid={err ? true : undefined}
                                                    title={err ?? (dirty ? `Was ${was(c.field, initials[b.id][c.field])}` : below ? 'The MRP is below the cost' : undefined)}
                                                    onChange={(e) => setCell(b.id, c.field, e.target.value)}
                                                    onKeyDown={(e) => onKeyDown(e, rowIndex, c.field)}
                                                    onPaste={(e) => onPaste(e, rowIndex, c.field)}
                                                    className={cn(
                                                        CELL_BASE,
                                                        c.align === 'right' && 'text-right',
                                                        c.field === 'batchNo' && 'font-mono font-medium',
                                                        c.field === 'packSize' && 'pr-14',
                                                        err ? 'border-destructive bg-red-50 dark:bg-red-950/30'
                                                            : dirty ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                                                            : 'border-transparent hover:border-input',
                                                    )}
                                                />
                                                {c.field === 'packSize' && (
                                                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        {odd && <span title="Different from the other batches" className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="different from the other batches" role="img" />}
                                                        {(b.packUnit || product.packUnit || '').slice(0, 6)}
                                                    </span>
                                                )}
                                                {below && !err && <AlertTriangle className="pointer-events-none absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-600" aria-hidden="true" />}
                                            </div>
                                        </td>
                                    );
                                };

                                return (
                                    <tr key={b.id} className={cn(state === 'empty' && 'bg-muted/20', state === 'expired' && 'bg-red-50/40')}>
                                        {columns.slice(0, 3).map(cell)}
                                        <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums text-muted-foreground">
                                            {state === 'empty' ? 'Empty' : formatQty(b.qtyStrips || 0, b.qtyLoose || 0, Number(initials[b.id].packSize) || 1, b.packType || product.packType, b.packUnit || product.packUnit)}
                                            {serverErr[b.id]?.row && <span role="alert" className="block text-xs font-medium text-destructive">{serverErr[b.id]!.row}</span>}
                                            {state !== 'empty' && pack !== Number(initials[b.id].packSize) && (b.qtyLoose || 0) > 0 && <span className="block text-xs text-amber-700">loose re-counted</span>}
                                        </td>
                                        {columns.slice(3).map(cell)}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* the bar follows you down the page, so Save is always in reach however many batches there are */}
            <div className="sticky bottom-3 z-20 rounded-xl border bg-card p-3 shadow-lg" aria-live="polite">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 text-sm">
                        {rows.length === 0 ? (
                            <span className="text-muted-foreground">No changes yet. Click a cell and type; every batch is editable at once.</span>
                        ) : (
                            <details>
                                <summary className="cursor-pointer select-none font-medium">
                                    {rows.length} {rows.length === 1 ? 'batch' : 'batches'} changed
                                    <span className="font-normal text-muted-foreground"> · {rows.reduce((n, r) => n + r.changes.length, 0)} cells · review</span>
                                </summary>
                                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs tabular-nums">
                                    {rows.map((r) => (
                                        <li key={r.id}>
                                            <span className="font-mono font-medium">{r.label}</span>{' '}
                                            {r.changes.map((c) => <span key={c.field} className="mr-2 whitespace-nowrap text-muted-foreground">{c.label} {c.from} <span aria-hidden="true">→</span><span className="sr-only">to</span> <span className="font-medium text-foreground">{c.to}</span></span>)}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                        {problems.length > 0 && (
                            <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                {problems.length} {problems.length === 1 ? 'cell needs' : 'cells need'} fixing. {problems[0].batchNo}: {problems[0].message}
                            </p>
                        )}
                    </div>

                    {packChanged && (
                        <label className={cn('flex max-w-sm cursor-pointer items-start gap-2 text-xs', showPackError && !packConfirmed && 'text-destructive')}>
                            <input type="checkbox" checked={packConfirmed} onChange={(e) => { setPackConfirmed(e.target.checked); setShowPackError(false); }} className="mt-0.5 h-4 w-4 rounded border-input" />
                            <span>A new pack size re-counts that batch&apos;s loose stock. I understand.</span>
                        </label>
                    )}

                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={discard} disabled={busy}>{rows.length ? 'Discard' : 'Done'}</Button>
                        <Button type="button" onClick={saveAll} disabled={busy || rows.length === 0}>
                            <Check aria-hidden="true" />
                            {busy ? 'Saving…' : rows.length === 0 ? 'Save all' : `Save ${rows.length} ${rows.length === 1 ? 'batch' : 'batches'}`}
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}
