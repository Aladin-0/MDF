'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToastAction } from '@/components/ui/toast';
import { ModalSection, ModalShell } from '@/components/shared/ModalShell';
import { PACK_TYPE_OPTIONS, PACK_UNIT_OPTIONS } from '@/constants/productBehavior';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/apiError';
import {
    buildBatchPatch, buildUndoPatch, diffBatchForm, serverErrors, toForm, touchesPack, validateBatchForm,
    type BatchFormField, type BatchFormValues, type EditableBatch,
} from '@/lib/batchEdit';
import { formatQty } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface SaveResult { changed?: string[]; warnings?: string[] }

interface EditBatchModalProps {
    batch: (EditableBatch & { id: string; qtyStrips: number; qtyLoose: number }) | null;
    productName: string;
    /** Purchase and landing rates are only for people allowed to see purchase rates. */
    showRates: boolean;
    /** Sends the patch (ONLY the changed fields). Resolves with the server's answer, rejects with its error. */
    onSave: (batchId: string, patch: Record<string, string | number | null>) => Promise<SaveResult | void>;
    onClose: () => void;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
            {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

function EditBatchDialog({ batch, productName, showRates, onSave, onClose }: Omit<EditBatchModalProps, 'batch'> & { batch: NonNullable<EditBatchModalProps['batch']> }) {
    const { toast } = useToast();
    const initial = useMemo(() => toForm(batch), [batch]);
    const [form, setForm] = useState<BatchFormValues>(initial);
    const [errors, setErrors] = useState<Partial<Record<BatchFormField, string>>>({});
    const [packOpen, setPackOpen] = useState(false);
    const [packConfirmed, setPackConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const changes = useMemo(() => diffBatchForm(initial, form), [initial, form]);
    const packChanged = touchesPack(changes);
    const set = (field: BatchFormField) => (e: { target: { value: string } }) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        if (errors[field]) setErrors((x) => ({ ...x, [field]: undefined }));
    };
    const setValue = (field: BatchFormField) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

    const cost = Number(form.landingRate) || Number(form.purchaseRate) || 0;
    const belowCost = showRates && Number(form.mrp) > 0 && cost > 0 && Number(form.mrp) < cost;
    const unitOptions = PACK_UNIT_OPTIONS.some((o) => o.value === form.packUnit.toLowerCase()) || !form.packUnit
        ? PACK_UNIT_OPTIONS : [...PACK_UNIT_OPTIONS, { value: form.packUnit, label: form.packUnit }];

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        const found = validateBatchForm(form, { showRates });
        if (Object.keys(found).length) {
            setErrors(found);
            const first = Object.keys(found)[0];
            if (['packSize', 'packUnit'].includes(first)) setPackOpen(true);
            requestAnimationFrame(() => document.getElementById(`eb-${first}`)?.focus());
            return;
        }
        if (changes.length === 0) return;
        if (packChanged && !packConfirmed) { setErrors({ packSize: 'Tick the box below to confirm the pack change' }); return; }

        const patch = buildBatchPatch(initial, form);
        const undo = buildUndoPatch(initial, form);
        setBusy(true);
        try {
            const result = (await onSave(batch.id, patch)) || {};
            const warnings = result.warnings ?? [];
            toast({
                title: `Batch ${form.batchNo.trim()} updated`,
                description: [changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join(' · '), ...warnings].join('  '),
                duration: 10000,
                action: (
                    <ToastAction
                        altText="Undo this change"
                        onClick={() => {
                            onSave(batch.id, undo)
                                .then(() => toast({ title: 'Change undone', description: `Batch ${initial.batchNo} is back as it was.` }))
                                .catch((err) => toast({ variant: 'destructive', title: 'Could not undo', description: apiErrorMessage(err, 'Edit the batch again to put it back.') }));
                        }}
                    >
                        Undo
                    </ToastAction>
                ),
            });
            onClose();
        } catch (err) {
            const fields = serverErrors(err);
            if (Object.keys(fields).length) {
                setErrors(fields);
                if (fields.packSize || fields.packUnit || fields.packType) setPackOpen(true);
            } else {
                setFormError(`${apiErrorMessage(err, 'The batch was not changed.').replace(/[.!?]?\s*$/, '.')} Nothing was saved.`);
            }
        } finally {
            setBusy(false);
        }
    };

    const describedBy = (id: string, field: BatchFormField) => (errors[field] ? `${id}-error` : undefined);

    return (
        <ModalShell
            open
            onClose={onClose}
            title="Edit Batch"
            size="md"
            footer={
                <>
                    <Button type="submit" form="edit-batch-form" className="flex-1" disabled={busy || changes.length === 0}>
                        {busy ? 'Saving…' : changes.length === 0 ? 'No Changes Yet' : `Save ${changes.length} ${changes.length === 1 ? 'Change' : 'Changes'}`}
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                </>
            }
        >
            <form id="edit-batch-form" onSubmit={submit} noValidate className="space-y-6">
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{productName}</span> · In stock now{' '}
                    <span className="tabular-nums">{formatQty(batch.qtyStrips, batch.qtyLoose, batch.packSize || 1, batch.packType || 'strip', batch.packUnit || 'tablet')}</span>.
                    {' '}To change the quantity use Adjust, which asks for a PIN.
                </p>

                <ModalSection title="Batch">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field id="eb-batchNo" label="Batch no" error={errors.batchNo}>
                            <Input id="eb-batchNo" name="batchNo" autoComplete="off" spellCheck={false} value={form.batchNo} onChange={set('batchNo')} aria-invalid={!!errors.batchNo || undefined} aria-describedby={describedBy('eb-batchNo', 'batchNo')} />
                        </Field>
                        <Field id="eb-rackLocation" label="Rack" error={errors.rackLocation} hint="Where it sits on the shelf">
                            <Input id="eb-rackLocation" name="rackLocation" autoComplete="off" value={form.rackLocation} onChange={set('rackLocation')} />
                        </Field>
                    </div>
                </ModalSection>

                <ModalSection title="Dates">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field id="eb-mfgDate" label="Mfg date" error={errors.mfgDate} hint="Optional">
                            <Input id="eb-mfgDate" name="mfgDate" type="date" max={form.expiryDate || undefined} value={form.mfgDate} onChange={set('mfgDate')} aria-invalid={!!errors.mfgDate || undefined} aria-describedby={describedBy('eb-mfgDate', 'mfgDate')} />
                        </Field>
                        <Field id="eb-expiryDate" label="Expiry date" error={errors.expiryDate}>
                            <Input id="eb-expiryDate" name="expiryDate" type="date" min={form.mfgDate || undefined} value={form.expiryDate} onChange={set('expiryDate')} aria-invalid={!!errors.expiryDate || undefined} aria-describedby={describedBy('eb-expiryDate', 'expiryDate')} />
                        </Field>
                    </div>
                </ModalSection>

                <ModalSection title="Prices (per pack)">
                    <div className={cn('grid gap-3', showRates ? 'sm:grid-cols-3' : 'sm:grid-cols-1')}>
                        <Field id="eb-mrp" label="MRP" error={errors.mrp}>
                            {/* the price is what is edited most: start here */}
                            <Input id="eb-mrp" name="mrp" type="number" inputMode="decimal" min={0} step="0.01" autoFocus autoComplete="off" value={form.mrp} onChange={set('mrp')} className="tabular-nums" aria-invalid={!!errors.mrp || undefined} aria-describedby={describedBy('eb-mrp', 'mrp')} />
                        </Field>
                        {showRates && (
                            <>
                                <Field id="eb-purchaseRate" label="Purchase rate" error={errors.purchaseRate}>
                                    <Input id="eb-purchaseRate" name="purchaseRate" type="number" inputMode="decimal" min={0} step="0.01" autoComplete="off" value={form.purchaseRate} onChange={set('purchaseRate')} className="tabular-nums" aria-invalid={!!errors.purchaseRate || undefined} aria-describedby={describedBy('eb-purchaseRate', 'purchaseRate')} />
                                </Field>
                                <Field id="eb-landingRate" label="Landing rate" error={errors.landingRate} hint="Cost incl. tax and freight">
                                    <Input id="eb-landingRate" name="landingRate" type="number" inputMode="decimal" min={0} step="0.01" autoComplete="off" value={form.landingRate} onChange={set('landingRate')} className="tabular-nums" aria-invalid={!!errors.landingRate || undefined} aria-describedby={describedBy('eb-landingRate', 'landingRate')} />
                                </Field>
                            </>
                        )}
                    </div>
                    {belowCost && (
                        <p role="status" className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            The MRP is below the cost, so this batch will sell at a loss. You can still save it.
                        </p>
                    )}
                </ModalSection>

                <ModalSection>
                    <button
                        type="button"
                        onClick={() => setPackOpen((o) => !o)}
                        aria-expanded={packOpen}
                        aria-controls="eb-pack"
                        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Pack details{packChanged && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-amber-800">changed</span>}
                        <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', packOpen && 'rotate-180')} aria-hidden="true" />
                    </button>
                    {packOpen && (
                        <div id="eb-pack" className="mt-3 space-y-3">
                            <p className="rounded-md bg-muted/60 p-2.5 text-sm text-muted-foreground">
                                This changes only <strong className="font-medium text-foreground">this batch</strong>. A new pack size re-counts its loose stock.
                                To fix the pack for <em>every</em> batch of the product, use Edit Product.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Field id="eb-packType" label="Pack type" error={errors.packType}>
                                    <Select value={form.packType} onValueChange={setValue('packType')}>
                                        <SelectTrigger id="eb-packType"><SelectValue /></SelectTrigger>
                                        <SelectContent>{PACK_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </Field>
                                <Field id="eb-packSize" label="Pack size" error={errors.packSize}>
                                    <Input id="eb-packSize" name="packSize" type="number" inputMode="numeric" min={1} step={1} autoComplete="off" value={form.packSize} onChange={set('packSize')} className="tabular-nums" aria-invalid={!!errors.packSize || undefined} aria-describedby={describedBy('eb-packSize', 'packSize')} />
                                </Field>
                                <Field id="eb-packUnit" label="Unit" error={errors.packUnit}>
                                    <Select value={form.packUnit} onValueChange={setValue('packUnit')}>
                                        <SelectTrigger id="eb-packUnit"><SelectValue /></SelectTrigger>
                                        <SelectContent>{unitOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </Field>
                            </div>
                            {packChanged && (
                                <label className="flex cursor-pointer items-start gap-2 text-sm">
                                    <input type="checkbox" checked={packConfirmed} onChange={(e) => setPackConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input" />
                                    <span>I understand this changes how the stock of this batch is counted.</span>
                                </label>
                            )}
                        </div>
                    )}
                </ModalSection>

                <div aria-live="polite" className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What will change</p>
                    {changes.length === 0 ? (
                        <p className="text-muted-foreground">Nothing yet. Change a field above.</p>
                    ) : (
                        <ul className="space-y-0.5">
                            {changes.map((c) => (
                                <li key={c.field} className="tabular-nums"><span className="text-muted-foreground">{c.label}:</span> {c.from} <span aria-hidden="true">→</span><span className="sr-only">to</span> <span className="font-medium">{c.to}</span></li>
                            ))}
                        </ul>
                    )}
                </div>

                {formError && (
                    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{formError}</span>
                    </div>
                )}
            </form>
        </ModalShell>
    );
}

export function EditBatchModal(props: EditBatchModalProps) {
    // mounted only while open, so every opening starts from the batch as it is now
    if (!props.batch) return null;
    return <EditBatchDialog {...props} batch={props.batch} />;
}
