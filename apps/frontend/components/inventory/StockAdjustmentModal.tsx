'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, RotateCcw, ShieldX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ModalSection, ModalShell } from '@/components/shared/ModalShell';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { apiErrorMessage } from '@/lib/apiError';
import { inventoryApi } from '@/lib/apiClient';
import { formatMonth } from '@/lib/dates';
import { adjustmentSchema } from '@/lib/validations/inventory';
import {
    buildAdjustPayload, canAdjustLoose, directionFor, pluralize, previewAdjustment,
    type AdjustmentDirection, type AdjustmentReason, type AdjustmentUnit,
} from '@/lib/inventory';
import { cn } from '@/lib/utils';

interface BatchLike {
    id: string;
    batchNo: string;
    expiryDate?: string;
    qtyStrips: number;
    qtyLoose: number;
    packSize?: number;
    packType?: string;
    packUnit?: string;
    allowsLoose?: boolean;
    rackLocation?: string;
}

interface StockAdjustmentModalProps {
    isOpen: boolean;
    /** The batch to adjust (or the one pre-selected when `batches` is given). */
    batch: BatchLike | null;
    /** All batches of the product: shows a picker so the right one can be chosen. */
    batches?: BatchLike[];
    productName?: string;
    onClose: () => void;
    /** Receives the exact request body for POST /inventory/adjust/. Defaults to calling it. */
    onSubmit?: (payload: ReturnType<typeof buildAdjustPayload>) => Promise<unknown>;
}

const REASONS: { value: AdjustmentReason; label: string; hint: string; icon: React.ReactNode; tone: string }[] = [
    { value: 'damage', label: 'Damage / Expiry', hint: 'Remove damaged or expired stock', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'text-red-600' },
    { value: 'theft', label: 'Theft / Loss', hint: 'Remove stolen or missing stock', icon: <ShieldX className="h-4 w-4" aria-hidden="true" />, tone: 'text-orange-600' },
    { value: 'correction', label: 'Stock Correction', hint: 'Fix a wrong count (add or remove)', icon: <RefreshCw className="h-4 w-4" aria-hidden="true" />, tone: 'text-blue-600' },
    { value: 'return_from_patient', label: 'Patient Return', hint: 'Add back unused medicine', icon: <RotateCcw className="h-4 w-4" aria-hidden="true" />, tone: 'text-emerald-600' },
];

function describe(strips: number, loose: number, b: BatchLike) {
    const pack = b.packType || 'strip';
    const unit = b.packUnit || 'unit';
    const parts = [`${strips} ${pluralize(pack, strips)}`];
    if (loose > 0 || !canAdjustLoose(b)) {
        if (loose > 0) parts.push(`${loose} ${pluralize(unit, loose)}`);
    }
    return parts.join(' + ');
}

function AdjustDialog({ batch: initial, batches, productName, onClose, onSubmit }: Omit<StockAdjustmentModalProps, 'isOpen' | 'batch'> & { batch: BatchLike }) {
    const outletId = useOutletId();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const choices = batches && batches.length > 1 ? batches : null;
    const [batchId, setBatchId] = useState(initial.id);
    const batch = choices?.find((b) => b.id === batchId) ?? initial;

    const [reasonType, setReasonType] = useState<AdjustmentReason>('damage');
    const [chosenDirection, setChosenDirection] = useState<AdjustmentDirection>('add');
    const [unit, setUnit] = useState<AdjustmentUnit>('packs');
    const [quantity, setQuantity] = useState('');
    const [note, setNote] = useState('');
    const [pin, setPin] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const looseOk = canAdjustLoose(batch);
    const effectiveUnit: AdjustmentUnit = looseOk ? unit : 'packs';
    const direction = directionFor(reasonType, chosenDirection);
    const packWord = pluralize(batch.packType || 'strip');
    const unitWord = pluralize(batch.packUnit || 'unit');

    const preview = useMemo(
        () => previewAdjustment(batch, effectiveUnit, direction, Number(quantity)),
        [batch, effectiveUnit, direction, quantity],
    );
    const qtyNumber = Math.floor(Number(quantity) || 0);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setServerError(null);
        const parsed = adjustmentSchema.safeParse({ adjustmentType: reasonType, direction, unit: effectiveUnit, quantity, reason: note, pin });
        if (!parsed.success) {
            const next: Record<string, string> = {};
            for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
            setErrors(next);
            return;
        }
        if (!preview) {
            setErrors({ quantity: 'This would take the stock below zero.' });
            return;
        }
        setErrors({});
        setBusy(true);
        try {
            const payload = buildAdjustPayload(batch.id, outletId, parsed.data);
            await (onSubmit ?? inventoryApi.adjustStock)(payload);
            toast({
                title: 'Stock adjusted',
                description: `${productName ? `${productName} · ` : ''}Batch ${batch.batchNo}: ${direction === 'remove' ? 'removed' : 'added'} ${qtyNumber} ${effectiveUnit === 'loose' ? unitWord : packWord}.`,
            });
            // the list, the cards and the tabs all read ['inventory', ...]
            await queryClient.invalidateQueries({ queryKey: ['inventory'] });
            onClose();
        } catch (err: any) {
            const message = apiErrorMessage(err, 'The stock was not changed.');
            if (err?.error?.code === 'INVALID_PIN') setErrors({ pin: 'That PIN was not recognised. Try again.' });
            else setServerError(`${message} Nothing was changed.`);
        } finally {
            setBusy(false);
        }
    };

    const actionLabel = `${direction === 'remove' ? 'Remove' : 'Add'}${qtyNumber > 0 ? ` ${qtyNumber} ${effectiveUnit === 'loose' ? unitWord : packWord}` : ' Stock'}`;
    const fieldError = (name: string) => errors[name] && <p id={`adj-${name}-error`} role="alert" className="mt-1 text-sm text-destructive">{errors[name]}</p>;

    const removing = direction === 'remove';

    return (
        <ModalShell
            open
            onClose={onClose}
            title="Adjust Stock"
            size="md"
            footer={
                <>
                    <Button type="submit" form="stock-adjust-form" className="flex-1" disabled={busy} variant={removing ? 'destructive' : 'default'}>
                        {busy ? 'Saving…' : actionLabel}
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                </>
            }
        >
        <form id="stock-adjust-form" onSubmit={submit} noValidate className="space-y-6">
            <ModalSection title="Batch">
                {choices ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="adj-batch">Which batch?</Label>
                        <Select value={batchId} onValueChange={(v) => { setBatchId(v); setErrors({}); }}>
                            <SelectTrigger id="adj-batch"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {choices.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.batchNo}{b.expiryDate ? ` · exp ${formatMonth(b.expiryDate)}` : ''} · {describe(b.qtyStrips, b.qtyLoose, b)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
                <dl className={cn('grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm', choices && 'mt-3')}>
                    <div>
                        <dt className="text-muted-foreground">{productName ? productName : 'Batch'}</dt>
                        <dd translate="no" className="font-medium">Batch {batch.batchNo}</dd>
                    </div>
                    <div className="text-right">
                        <dt className="text-muted-foreground">In stock now</dt>
                        <dd className="font-medium tabular-nums">{describe(batch.qtyStrips, batch.qtyLoose, batch)}</dd>
                    </div>
                </dl>
            </ModalSection>

            <ModalSection title="Why are you adjusting?">
                <div role="radiogroup" aria-label="Reason for the adjustment" className="grid gap-2 sm:grid-cols-2">
                    {REASONS.map((r) => (
                        <label
                            key={r.value}
                            className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50',
                                reasonType === r.value && 'border-primary bg-primary/5',
                            )}
                        >
                            <input
                                type="radio"
                                name="adjustment-reason"
                                value={r.value}
                                checked={reasonType === r.value}
                                onChange={() => setReasonType(r.value)}
                                className="sr-only"
                            />
                            <span className={cn('mt-0.5', r.tone)}>{r.icon}</span>
                            <span>
                                <span className="block text-sm font-medium">{r.label}</span>
                                <span className="block text-xs text-muted-foreground">{r.hint}</span>
                            </span>
                        </label>
                    ))}
                </div>

                {reasonType === 'correction' && (
                    <div role="group" aria-label="Direction of the correction" className="mt-3 inline-flex rounded-md bg-muted p-0.5">
                        {(['add', 'remove'] as const).map((d) => (
                            <button
                                key={d}
                                type="button"
                                aria-pressed={chosenDirection === d}
                                onClick={() => setChosenDirection(d)}
                                className={cn(
                                    'rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    chosenDirection === d ? 'bg-background shadow-sm' : 'text-muted-foreground',
                                )}
                            >
                                {d === 'add' ? 'Found extra (add)' : 'Count is short (remove)'}
                            </button>
                        ))}
                    </div>
                )}
            </ModalSection>

            <ModalSection title="How much?">
                <div className="flex flex-wrap items-start gap-3">
                    <div className="w-32">
                        <Label htmlFor="adj-quantity">Quantity</Label>
                        <Input
                            id="adj-quantity"
                            name="quantity"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            autoComplete="off"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            aria-invalid={!!errors.quantity || undefined}
                            aria-describedby={errors.quantity ? 'adj-quantity-error' : undefined}
                            className="mt-1.5 tabular-nums"
                        />
                    </div>
                    {looseOk && (
                        <div>
                            <span className="text-sm font-medium leading-none">Unit</span>
                            <div role="group" aria-label="Unit" className="mt-1.5 inline-flex rounded-md bg-muted p-0.5">
                                {([['packs', packWord], ['loose', unitWord]] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={effectiveUnit === value}
                                        onClick={() => setUnit(value)}
                                        className={cn(
                                            'h-9 rounded px-3 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            effectiveUnit === value ? 'bg-background shadow-sm' : 'text-muted-foreground',
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {fieldError('quantity')}

                <p aria-live="polite" className={cn('mt-3 text-sm', preview ? 'text-muted-foreground' : 'font-medium text-destructive')}>
                    {preview
                        ? <>Stock after this: <span className="font-semibold text-foreground tabular-nums">{describe(preview.strips, preview.loose, batch)}</span></>
                        : 'This would take the stock below zero. Lower the quantity.'}
                </p>
            </ModalSection>

            <ModalSection title="Confirm">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="adj-reason">Reason</Label>
                        <Textarea
                            id="adj-reason"
                            name="reason"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What happened? e.g. Box crushed in delivery…"
                            rows={2}
                            aria-invalid={!!errors.reason || undefined}
                            aria-describedby={errors.reason ? 'adj-reason-error' : undefined}
                            className="mt-1.5"
                        />
                        {fieldError('reason')}
                    </div>
                    <div className="w-48">
                        <Label htmlFor="adj-pin">Staff PIN</Label>
                        <Input
                            id="adj-pin"
                            name="pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            aria-invalid={!!errors.pin || undefined}
                            aria-describedby={errors.pin ? 'adj-pin-error' : undefined}
                            className="mt-1.5 tabular-nums"
                        />
                        {fieldError('pin')}
                    </div>
                    <p className="text-xs text-muted-foreground">This is recorded in the stock ledger with the PIN holder&apos;s name.</p>
                </div>
            </ModalSection>

            {serverError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{serverError}</span>
                </div>
            )}

        </form>
        </ModalShell>
    );
}

export function StockAdjustmentModal({ isOpen, batch, batches, productName, onClose, onSubmit }: StockAdjustmentModalProps) {
    // The dialog is mounted only while open, so every opening starts with a clean form.
    if (!isOpen || !batch) return null;
    return <AdjustDialog batch={batch} batches={batches} productName={productName} onClose={onClose} onSubmit={onSubmit} />;
}
