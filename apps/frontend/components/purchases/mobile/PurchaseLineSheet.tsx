'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarX, ChevronDown, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ProductSearchResult, PurchaseItemFormData } from '@/types';
import { cn } from '@/lib/utils';
import { SheetShell } from '@/components/billing/mobile/SheetShell';
import { T } from '@/components/billing/mobile/theme';
import { NumField } from './NumField';
import type { PurchaseEntry } from '@/hooks/usePurchaseEntry';
import { usePurchaseProductSearch } from '@/hooks/usePurchaseProductSearch';
import { useOutletSettings } from '@/hooks/useOutletSettings';
import { calculateLandingRate } from '@/lib/purchase-calculations';
import { fmt, effectivePkg, lineAmount } from '@/lib/purchaseEntry';
import { parsePkg, pkgNote } from '@/lib/purchasePack';
import { calcPTR, calcPTS, finishExpiryInput, formatExpiryForDisplay, getExpiryStatus, lineIssues, maskExpiryInput } from '@/lib/purchaseLine';
import { formatStockQty } from '../PurchaseItemRow';

const GST_SLABS = [0, 5, 12, 18, 28];

/** A group of the desktop row's columns (shadcn FieldSet + FieldLegend), shown as a card with the slate band the desktop table header uses */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
            <FieldSet className="gap-0">
                <FieldLegend variant="label" className={cn(T.band, 'mb-0 w-full px-3 py-2')}>{title}</FieldLegend>
                <FieldGroup className="gap-3 p-3">{children}</FieldGroup>
            </FieldSet>
        </div>
    );
}

/** A labelled text box (HSN, BATCH, EXPIRY) in the same shadcn Field shape as NumField */
function TextField({ label, id, testId, value, onChange, onBlur, placeholder, inputMode, maxLength, autoFocus, error, errorText, hint, className }: {
    label: string; id: string; testId: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string;
    inputMode?: 'numeric' | 'text'; maxLength?: number; autoFocus?: boolean; error?: boolean; errorText?: string; hint?: string; className?: string;
}) {
    const showError = !!error && !!errorText;
    return (
        <Field data-invalid={error || undefined} className="min-w-0 gap-1">
            <FieldLabel htmlFor={id} className={cn(T.label, 'w-full')}>{label}</FieldLabel>
            <input
                id={id} data-testid={testId} value={value} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus}
                autoComplete="off" spellCheck={false} autoCapitalize="characters"
                aria-invalid={error || undefined}
                aria-describedby={[hint ? `${id}-hint` : '', showError ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
                onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
                className={cn(T.input, 'h-12 w-full px-3 font-mono text-lg font-bold uppercase', error && 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-500/30', className)}
            />
            {hint && <FieldDescription id={`${id}-hint`} className="text-xs font-medium text-slate-700">{hint}</FieldDescription>}
            {showError && <FieldError id={`${id}-error`} className="text-xs font-bold text-red-700">{errorText}</FieldError>}
        </Field>
    );
}

interface PurchaseLineSheetProps {
    entry: PurchaseEntry;
    /** Position in `entry.items`; null = closed */
    index: number | null;
    onClose: () => void;
}

/**
 * Adds or edits ONE medicine of a purchase, on a phone: 1 medicine -> 2 batch and expiry -> 3 quantity -> 4 rates, with the rarely used
 * prices (HSN, PTR, PTS, cess, freight, other cost) folded away. Every change goes straight into the purchase (the card behind updates);
 * closing a row that was never filled in removes it again.
 */
export function PurchaseLineSheet({ entry, index, onClose }: PurchaseLineSheetProps) {
    const { items, handleItemChange, handleSelectProduct, handleOpenAddProduct, handleRemoveItem, outletId } = entry;
    const open = index !== null;
    const value: PurchaseItemFormData | undefined = index !== null ? items[index] : undefined;
    const [query, setQuery] = useState('');
    const [more, setMore] = useState(false);
    // a required box is only called wrong once the clerk has been in it (or has left it empty and pressed Done)
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const { results, searching } = usePurchaseProductSearch(query, outletId);
    const { data: settings } = useOutletSettings();
    const searchRef = useRef<HTMLInputElement>(null);

    // a fresh sheet every time it opens
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setMore(false);
        setTouched({});
    }, [open, index]);

    const hasProduct = !!value?.productId;
    useEffect(() => {
        if (open && value && !hasProduct) { const t = setTimeout(() => searchRef.current?.focus(), 250); return () => clearTimeout(t); }
    }, [open, hasProduct, value]);

    if (index === null || !value) return <SheetShell open={false} onClose={onClose} title="Medicine">{null}</SheetShell>;
    const set = (field: keyof PurchaseItemFormData, v: string | number) => handleItemChange(index, field, v);
    const touch = (k: string) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
    const pkgCheck = parsePkg(value.pkg);
    const serverPkg = entry.pkgServerIssue?.index === index ? entry.pkgServerIssue.message : (entry.errors as any)?.items?.[index]?.pkg?.message;
    const pkgErrorText = serverPkg || (!pkgCheck.ok && (touched.pkg || (value.pkg as unknown) !== '') ? pkgCheck.message : undefined);

    const close = () => {
        // a row nobody filled in (no product, no name) is not kept
        const current = items[index];
        if (current && !current.productId && !current.productName && items.length > 1) handleRemoveItem(index);
        onClose();
    };
    const pick = (p: ProductSearchResult) => { setQuery(''); handleSelectProduct(index, p); };
    const clearProduct = () => { set('productId', ''); set('productName', ''); set('isCustom', 0); setQuery(''); };

    const status = getExpiryStatus(value.expiryDate);
    const issues = lineIssues(value);
    const units = value.qty * effectivePkg(value.pkg);
    const landingRate = calculateLandingRate(
        value.purchaseRate || 0, value.qty || 0, value.freeQty || 0, value.discountPct || 0, value.cashDiscountPct || 0, value.gstRate || 0, value.cess || 0,
        value.freightPerUnit || 0,
        settings ? (!settings.gstRegistered || settings.landingCostIncludeGst) : false,
        settings?.landingCostIncludeFreight ?? true,
        value.otherCostPerUnit || 0,
    );
    const slabs = GST_SLABS.includes(value.gstRate) ? GST_SLABS : [...GST_SLABS, value.gstRate].sort((a, b) => a - b);
    const onMrp = (mrp: number) => {
        set('mrp', mrp);
        if (mrp > 0) {                                  // same defaults as the desktop grid
            if (!value.ptr) set('ptr', calcPTR(mrp, value.gstRate));
            if (!value.pts) set('pts', calcPTS(calcPTR(mrp, value.gstRate)));
        }
    };
    const suggestions = !hasProduct ? (value.ocrSuggestions ?? []) : [];

    return (
        <SheetShell
            open
            full
            onClose={close}
            title={hasProduct ? 'Medicine' : 'Find the medicine'}
            description={hasProduct ? `AMOUNT ${fmt(lineAmount(value))} · LANDING COST FLOOR ${fmt(landingRate)}` : 'Search by name, then pick it from the list'}
            bodyClassName="bg-slate-100 space-y-3"
            footer={
                <div className="flex gap-2">
                    {(hasProduct || items.length > 1) && (
                        <button type="button" data-testid="line-remove" onClick={() => { handleRemoveItem(index); onClose(); }}
                            className="flex h-12 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-red-500 bg-white px-4 text-sm font-bold text-red-700 active:bg-red-50">
                            <Trash2 className="h-4 w-4" aria-hidden /> Remove
                        </button>
                    )}
                    <button type="button" data-testid="line-done" onClick={close} className={cn(T.cta, 'h-12 flex-1 text-base')}>
                        {hasProduct ? 'Done' : 'Cancel'}
                    </button>
                </div>
            }
        >
            {!hasProduct ? (
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-700" aria-hidden />
                        <input
                            ref={searchRef}
                            data-testid="purchase-search-input"
                            spellCheck={false}
                            autoCapitalize="off"
                            aria-label="Search medicine"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Type the medicine name…"
                            autoComplete="off"
                            className={cn(T.input, 'h-12 w-full pl-10 pr-10 text-base font-semibold')}
                        />
                        {query && (
                            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-700">
                                <X className="h-5 w-5" aria-hidden />
                            </button>
                        )}
                    </div>

                    {value.ocrOriginalName && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                            <p className="font-bold">The bill says: “{value.ocrOriginalName}”</p>
                            {suggestions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {suggestions.slice(0, 3).map((s) => (
                                        <button key={s.id} type="button" data-testid="ocr-suggestion"
                                            onClick={() => pick({ id: s.id, name: s.name, packSize: s.packSize ?? undefined, packUnit: s.packUnit ?? undefined, hsnCode: s.hsnCode ?? '', gstRate: s.gstRate ?? 0, mrp: s.mrp ?? 0, saleRate: 0, batches: [] } as unknown as ProductSearchResult)}
                                            className="min-h-[44px] rounded-lg border-2 border-sky-500 bg-white px-3 text-left text-sm font-bold text-sky-800 active:bg-sky-50">
                                            Use {s.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {query.trim().length < 2 ? (
                        <p className="px-1 text-sm font-medium text-slate-700">Type at least 2 letters.</p>
                    ) : searching ? (
                        <p role="status" className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-700"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…</p>
                    ) : (
                        <ul className="space-y-2">
                            {results.map((p) => (
                                <li key={p.id}>
                                    <button type="button" data-testid="purchase-search-result" onClick={() => pick(p)} className={cn(T.card, 'flex min-h-[64px] w-full touch-manipulation flex-col gap-0.5 px-3 py-2.5 text-left active:bg-slate-50')}>
                                        <span className="text-base font-bold text-slate-900">{p.name}</span>
                                        {p.composition && <span className="truncate text-sm text-slate-700">{p.composition}</span>}
                                        <span className={cn('text-xs font-semibold text-slate-700', T.money)}>
                                            GST {p.gstRate}% · MRP {fmt(p.mrp || 0)} · Stock {formatStockQty(p.totalStock)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                            {results.length === 0 && <li className="px-1 text-sm font-medium text-slate-700">No medicine found for “{query.trim()}”.</li>}
                        </ul>
                    )}

                    {query.trim().length >= 2 && !searching && (
                        <button type="button" data-testid="add-new-product" onClick={() => handleOpenAddProduct(index, query.trim())}
                            className={cn(T.ctaOutline, 'flex h-12 w-full touch-manipulation items-center justify-center gap-2 text-sm')}>
                            <Plus className="h-4 w-4" aria-hidden /> Add “{query.trim()}” as a new product
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div className={cn(T.card, 'flex items-start justify-between gap-3 p-3')}>
                        <div className="min-w-0">
                            <p data-testid="line-product-name" className="text-base font-extrabold uppercase leading-snug text-slate-900">{value.productName}</p>
                            {value.packUnitLabel && <p className="mt-0.5 text-sm text-slate-700">{value.packUnitLabel}</p>}
                            {value.ocrOriginalName && value.ocrOriginalName.toUpperCase() !== value.productName.toUpperCase() && (
                                <p className="mt-1 text-xs font-bold text-amber-900">Bill says “{value.ocrOriginalName}”</p>
                            )}
                        </div>
                        <button type="button" data-testid="change-product" onClick={clearProduct} className="min-h-[44px] shrink-0 rounded-lg border-2 border-slate-400 px-3 text-sm font-bold text-slate-900 active:bg-slate-100">Change</button>
                    </div>

                    <Section title="Item">
                        <div className="grid grid-cols-2 gap-3">
                            <TextField label="HSN" id="line-hsn" testId="line-hsn" inputMode="numeric" value={value.hsnCode} onChange={(v) => set('hsnCode', v)} placeholder="300490" />
                            <TextField label="Batch" id="line-batch" testId="line-batch" autoFocus={!value.batchNo} value={value.batchNo} onChange={(v) => set('batchNo', v)} onBlur={touch('batch')} placeholder="Batch No"
                                error={touched.batch && issues.includes('batch')} errorText="Enter the batch number" />
                            <TextField label="Expiry" id="line-expiry" testId="line-expiry" inputMode="numeric" maxLength={7} placeholder="MM/YYYY" value={formatExpiryForDisplay(value.expiryDate)}
                                onChange={(v) => set('expiryDate', maskExpiryInput(v))}
                                onBlur={() => { touch('expiry')(); if (value.expiryDate) set('expiryDate', finishExpiryInput(value.expiryDate)); }}
                                error={status === 'expired' || (touched.expiry && issues.includes('expiry'))}
                                errorText={status === 'expired' ? undefined : 'Enter the expiry as MM/YY'}
                                className={cn(status === 'near' && 'border-amber-500 bg-amber-50')} />
                            <NumField label="Pkg" mode="numeric" value={Number(value.pkg) || 0} onChange={(n) => set('pkg', n || ('' as unknown as number))} onBlur={touch('pkg')} testId="line-pkg" placeholder="Pkg"
                                hint={[value.packUnitLabel, pkgNote(value)?.text].filter(Boolean).join(' · ') || undefined}
                                error={!!pkgErrorText} errorText={pkgErrorText} />
                        </div>
                        {status !== 'ok' && (
                            <p data-testid="line-expiry-warning" role="alert" className={cn('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-bold', status === 'expired' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900')}>
                                {status === 'expired' ? <CalendarX className="h-4 w-4" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}
                                {status === 'expired' ? 'This batch is already expired' : 'Expires within 90 days: check with the distributor'}
                            </p>
                        )}
                    </Section>

                    <Section title="Quantity">
                        <div className="grid grid-cols-2 gap-3">
                            <NumField label="Qty" mode="numeric" value={value.qty} onChange={(n) => set('qty', n)} onBlur={touch('qty')} testId="line-qty" placeholder="Qty"
                                error={touched.qty && !(value.qty > 0)} errorText="Enter the quantity" />
                            <NumField label="Free" mode="numeric" value={value.freeQty} onChange={(n) => set('freeQty', n)} testId="line-free" placeholder="Free" />
                        </div>
                        <p data-testid="line-units" className={cn('min-h-5 text-sm font-bold text-slate-900', T.money)}>
                            {units > 0 ? `= ${units} units${value.freeQty > 0 ? ` + ${value.freeQty * effectivePkg(value.pkg)} free` : ''}` : ''}
                        </p>
                    </Section>

                    <Section title="Price">
                        <div className="grid grid-cols-2 gap-3">
                            <NumField label="MRP" prefix="₹" value={value.mrp} onChange={onMrp} onBlur={touch('mrp')} testId="line-mrp" error={touched.mrp && !(value.mrp > 0)} errorText="Enter the MRP" />
                            <NumField label="Rate" prefix="₹" value={value.purchaseRate} onChange={(n) => set('purchaseRate', n)} onBlur={touch('rate')} testId="line-rate"
                                error={touched.rate && !(value.purchaseRate > 0)} errorText="Enter the purchase rate" />
                            <Field className="col-span-2 min-w-0 gap-1">
                                <FieldLabel id="gst-label" className={cn(T.label, 'w-full')}>GST%</FieldLabel>
                                <RadioGroup aria-labelledby="gst-label" value={String(value.gstRate)} onValueChange={(v) => set('gstRate', Number(v))} className="flex flex-wrap gap-1.5">
                                    {slabs.map((g) => (
                                        <div key={g} className="flex">
                                            <RadioGroupItem value={String(g)} id={`line-gst-${g}`} data-testid={`gst-${g}`} className="peer sr-only" />
                                            <Label htmlFor={`line-gst-${g}`}
                                                className="flex min-h-[44px] min-w-[52px] cursor-pointer touch-manipulation items-center justify-center rounded-lg border-2 border-slate-400 bg-white px-3 text-sm font-extrabold text-slate-900 active:bg-slate-100 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-2 peer-data-[state=checked]:border-sky-500 peer-data-[state=checked]:bg-sky-500 peer-data-[state=checked]:text-white">
                                                {g}%
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </Field>
                            <NumField label="PTR" prefix="₹" value={value.ptr} onChange={(n) => set('ptr', n)} testId="line-ptr" />
                            <NumField label="PTS" prefix="₹" value={value.pts} onChange={(n) => set('pts', n)} testId="line-pts" />
                            <NumField label="Disc%" suffix="%" value={value.discountPct} onChange={(n) => set('discountPct', n)} testId="line-disc" />
                        </div>
                    </Section>

                    <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
                        <button type="button" data-testid="more-pricing" aria-expanded={more} aria-controls="pricing-details" onClick={() => setMore((m) => !m)}
                            className={cn(T.band, 'flex min-h-[44px] w-full touch-manipulation items-center justify-between px-3 py-2 text-left')}>
                            Pricing Details (Cess%, Freight, Other cost)
                            <ChevronDown className={cn('h-5 w-5 transition-transform', more && 'rotate-180')} aria-hidden />
                        </button>
                        {more && (
                            <div id="pricing-details" data-testid="more-pricing-fields" className="grid grid-cols-2 gap-3 p-3">
                                <NumField label="Cess%" suffix="%" value={value.cess} onChange={(n) => set('cess', n)} testId="line-cess" />
                                <NumField label="Freight/Unit ₹" prefix="₹" value={value.freightPerUnit ?? 0} onChange={(n) => set('freightPerUnit', n)} testId="line-freight" />
                                <NumField label="Other/Unit ₹" prefix="₹" value={value.otherCostPerUnit ?? 0} onChange={(n) => set('otherCostPerUnit', n)} testId="line-other" />
                            </div>
                        )}
                    </div>

                    <div className={cn(T.dock, 'rounded-xl p-3')} data-testid="line-summary">
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Amount</p>
                                <p data-testid="line-total" className={cn('text-3xl font-black leading-tight', T.money)}>{fmt(lineAmount(value))}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Landing cost floor</p>
                                <p data-testid="line-landing" className={cn('text-lg font-extrabold', T.money)}>{fmt(landingRate)}</p>
                            </div>
                        </div>
                        {issues.length > 0 && (
                            <p data-testid="line-open-issues" className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-amber-300">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Still needed: {issues.map((i) => ({ product: 'medicine', batch: 'batch', expiry: 'expiry', pkg: 'pkg', qty: 'qty', rate: 'rate', mrp: 'MRP' } as const)[i]).join(', ')}
                            </p>
                        )}
                    </div>
                </>
            )}
        </SheetShell>
    );
}
