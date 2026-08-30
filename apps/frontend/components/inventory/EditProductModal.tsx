'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { productsApi } from '@/lib/apiClient';
import { MasterProduct } from '@/types';
import {
    Package, Pill, Barcode, Thermometer, AlertTriangle,
    RotateCcw, IndianRupee, ReceiptText, FlaskConical,
} from 'lucide-react';
import { PACK_TYPE_OPTIONS, DISPENSING_UNIT_OPTIONS } from '@/constants/productBehavior';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { inferPackUnit } from '@/utils/productUtils';
import { Pencil } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEDULE_OPTIONS = [
    { value: 'OTC',        label: 'OTC / General' },
    { value: 'G',          label: 'Schedule G' },
    { value: 'H',          label: 'Schedule H' },
    { value: 'H1',         label: 'Schedule H1' },
    { value: 'X',          label: 'Schedule X' },
    { value: 'C',          label: 'Schedule C (Biological)' },
    { value: 'Narcotic',   label: 'Narcotic (NDPS)' },
    { value: 'Ayurvedic',  label: 'Ayurvedic / Herbal' },
    { value: 'Surgical',   label: 'Surgical / Device' },
    { value: 'Cosmetic',   label: 'Cosmetic' },
    { value: 'Veterinary', label: 'Veterinary' },
];

const GST_RATES = [0, 5, 12, 18, 28];

// ─── Form type ────────────────────────────────────────────────────────────────

interface FormValues {
    name: string;
    composition: string;
    manufacturer: string;
    hsnCode: string;
    gstRate: number;
    packSize: number;
    packUnit: string;
    packType: string;
    scheduleType: string;
    mrp: number;
    barcode: string;
    minQty: number;
    reorderQty: number;
    isFridge: boolean;
    isDiscontinued: boolean;
    batches: {
        batchNo: string;
        expiryDate: string;
        qtyStrips: number;
        qtyLoose: number;
        mrp: number;
        margin: number;
        landingRate: number;
    }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EditProductModalProps {
    product: MasterProduct | null;
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSaved?: (updated: MasterProduct) => void;
}

export function EditProductModal({
    product,
    open,
    onOpenChange,
    onSaved,
}: EditProductModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [isEditingUnit, setIsEditingUnit] = useState(false);
    const [apiErrors, setApiErrors] = useState<Record<string, string>>({});

    const {
        register,
        handleSubmit,
        reset,
        control,
        setValue,
        watch,
        getValues,
        formState: { errors, isDirty },
    } = useForm<FormValues>({
        defaultValues: { batches: [] }
    });

    const { fields: batchFields, append: appendBatch, remove: removeBatch } = useFieldArray({
        control,
        name: 'batches'
    });

    const watchPackType = watch('packType');
    const watchPackUnit = watch('packUnit');
    const watchName = watch('name');

    // Watch batches for margin calc
    const watchedBatches = watch('batches');

    useEffect(() => {
        watchedBatches?.forEach((batch, index) => {
            if (batch.mrp && batch.margin != null) {
                const calculatedLanding = batch.mrp - (batch.mrp * (batch.margin / 100));
                // Only update if it actually changed to prevent infinite loops
                if (Math.abs(batch.landingRate - calculatedLanding) > 0.01) {
                    setValue(`batches.${index}.landingRate`, Number(calculatedLanding.toFixed(2)), { shouldDirty: true });
                }
            }
        });
    }, [watchedBatches, setValue]);

    // Populate form when product changes
    useEffect(() => {
        if (product) {
            reset({
                name:          product.name,
                composition:   product.composition,
                manufacturer:  product.manufacturer,
                hsnCode:       product.hsnCode ?? '',
                gstRate:       product.gstRate ?? 0,
                packSize:      product.packSize ?? 1,
                packUnit:      product.packUnit ?? '',
                packType:      product.packType ?? 'strip',
                scheduleType:  product.scheduleType ?? 'OTC',
                mrp:           product.mrp ?? 0,
                barcode:       product.barcode ?? '',
                minQty:        product.minQty ?? 10,
                reorderQty:    product.reorderQty ?? 50,
                isFridge:      product.isFridge ?? false,
                isDiscontinued: product.isDiscontinued ?? false,
            });
            setApiErrors({});
            setIsEditingUnit(false);
        }
    }, [product, reset]);

    const onSubmit = async (values: FormValues) => {
        if (!product) return;
        setSaving(true);
        setApiErrors({});
        try {
            const updated = await productsApi.update(product.id, {
                name:           values.name,
                composition:    values.composition,
                manufacturer:   values.manufacturer,
                hsnCode:        values.hsnCode,
                gstRate:        Number(values.gstRate),
                packSize:       Number(values.packSize),
                packUnit:       values.packUnit,
                packType:       values.packType,
                scheduleType:   values.scheduleType as any,
                mrp:            Number(values.mrp),
                barcode:        values.barcode || undefined,
                minQty:         Number(values.minQty),
                reorderQty:     Number(values.reorderQty),
                isFridge:       values.isFridge,
                isDiscontinued: values.isDiscontinued,
                batches:        values.batches,
            });
            // Invalidate all inventory + product queries
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['stock-list'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast({ title: 'Product updated', description: `${updated.name} saved successfully.` });
            onSaved?.(updated);
            onOpenChange(false);
        } catch (err: any) {
            const body = await err?.response?.json?.().catch(() => null) ?? null;
            if (body?.errors) {
                setApiErrors(body.errors);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Update failed',
                    description: err?.message ?? 'Unknown error',
                });
            }
        } finally {
            setSaving(false);
        }
    };

    if (!product) return null;

    const fieldErr = (key: keyof FormValues) =>
        errors[key]?.message ?? apiErrors[key] ?? '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-indigo-100 p-2">
                            <Package className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-slate-800">
                                Edit Product
                            </DialogTitle>
                            <p className="text-sm text-slate-500 mt-0.5 font-mono truncate max-w-md">
                                {product.name}
                            </p>
                        </div>
                        <div className="ml-auto flex gap-2">
                            {product.isFridge && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-xs">
                                    <Thermometer className="h-3 w-3 mr-1" /> Cold Chain
                                </Badge>
                            )}
                            {product.isDiscontinued && (
                                <Badge variant="outline" className="bg-red-50 text-red-500 border-red-200 text-xs">
                                    Discontinued
                                </Badge>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)}>
                    <ScrollArea className="max-h-[70vh]">
                        <div className="px-6 py-5">
                            <Tabs defaultValue="attributes" className="w-full">
                                <TabsList className="w-full grid grid-cols-3 mb-6 bg-slate-100">
                                    <TabsTrigger value="attributes">Attributes</TabsTrigger>
                                    <TabsTrigger value="compliance">Compliance</TabsTrigger>
                                    <TabsTrigger value="batches">Batches & Pricing</TabsTrigger>
                                </TabsList>

                                <TabsContent value="attributes" className="space-y-6 outline-none">
                                    {/* ── Section: Basic Info ── */}
                                    <Section icon={<Pill className="h-4 w-4 text-indigo-500" />} title="Basic Information">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Field label="Product Name *" error={fieldErr('name')} className="col-span-2">
                                                <Input {...register('name', { required: 'Name is required' })} placeholder="e.g. Paracetamol 500mg" />
                                            </Field>
                                            <Field label="Composition" error={fieldErr('composition')} className="col-span-2">
                                                <Input {...register('composition')} placeholder="e.g. Paracetamol IP 500mg" />
                                            </Field>
                                            <Field label="Manufacturer" error={fieldErr('manufacturer')}>
                                                <Input {...register('manufacturer')} placeholder="e.g. Sun Pharma" />
                                            </Field>
                                            <Field label="Barcode" error={fieldErr('barcode')} hint="Leave blank to clear">
                                                <Input {...register('barcode')} placeholder="Scan or enter barcode" />
                                            </Field>
                                        </div>
                                    </Section>
                                    <Separator />
                                    {/* ── Section: Stock Management ── */}
                                    <Section icon={<RotateCcw className="h-4 w-4 text-blue-500" />} title="Stock Management">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Field label="Low Stock Alert (strips)" error={fieldErr('minQty')}>
                                                <Input type="number" min={0} {...register('minQty', { valueAsNumber: true, min: 0 })} />
                                            </Field>
                                            <Field label="Reorder Quantity (strips)" error={fieldErr('reorderQty')}>
                                                <Input type="number" min={0} {...register('reorderQty', { valueAsNumber: true, min: 0 })} />
                                            </Field>
                                        </div>
                                    </Section>
                                </TabsContent>

                                <TabsContent value="compliance" className="space-y-6 outline-none">
                                    <Section icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} title="Compliance Details">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Field label="Schedule / Drug Type" error={fieldErr('scheduleType')}>
                                                <Controller
                                                    name="scheduleType"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select value={field.value} onValueChange={field.onChange}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {SCHEDULE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </Field>
                                            <Field label="GST Rate (%)" error={fieldErr('gstRate')}>
                                                <Controller
                                                    name="gstRate"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </Field>
                                            <Field label="HSN Code *" error={fieldErr('hsnCode')}>
                                                <Input {...register('hsnCode', { required: 'Required' })} placeholder="3004" />
                                            </Field>
                                        </div>
                                    </Section>
                                    <Separator />
                                    <Section icon={<Package className="h-4 w-4 text-slate-500" />} title="Product Flags">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex items-center justify-between rounded-lg border p-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5 text-blue-500" /> Cold Storage</p>
                                                </div>
                                                <Controller name="isFridge" control={control} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
                                            </div>
                                            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/30 p-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">Discontinued</p>
                                                </div>
                                                <Controller name="isDiscontinued" control={control} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
                                            </div>
                                        </div>
                                    </Section>
                                </TabsContent>

                                <TabsContent value="batches" className="space-y-6 outline-none">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-sm font-semibold text-slate-700">Active Batches</h3>
                                        <Button type="button" size="sm" variant="outline" onClick={() => appendBatch({ batchNo: '', expiryDate: '', qtyStrips: 0, qtyLoose: 0, mrp: 0, margin: 20, landingRate: 0 })}>
                                            + Add Batch
                                        </Button>
                                    </div>
                                    
                                    {batchFields.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500 border border-dashed rounded-lg bg-slate-50">
                                            No batches added yet. Click "+ Add Batch" to create one.
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {batchFields.map((field, index) => (
                                                <div key={field.id} className="p-4 border rounded-lg bg-white relative shadow-sm border-slate-200 group">
                                                    <button type="button" onClick={() => removeBatch(index)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        &times;
                                                    </button>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                                                        <Field label="Batch No">
                                                            <Input {...register(`batches.${index}.batchNo`)} placeholder="B123" />
                                                        </Field>
                                                        <Field label="Expiry (YYYY-MM)">
                                                            <Input type="month" {...register(`batches.${index}.expiryDate`)} />
                                                        </Field>
                                                        <Field label="Qty (Strips)">
                                                            <Input type="number" min={0} {...register(`batches.${index}.qtyStrips`, { valueAsNumber: true })} />
                                                        </Field>
                                                        <Field label="Qty (Loose)">
                                                            <Input type="number" min={0} {...register(`batches.${index}.qtyLoose`, { valueAsNumber: true })} />
                                                        </Field>
                                                        <Field label="MRP (₹)">
                                                            <Input type="number" step="0.01" {...register(`batches.${index}.mrp`, { valueAsNumber: true })} />
                                                        </Field>
                                                        <Field label="Margin (%)">
                                                            <Input type="number" step="0.1" {...register(`batches.${index}.margin`, { valueAsNumber: true })} />
                                                        </Field>
                                                        <Field label="Landing Rate (₹)" className="md:col-span-2">
                                                            <Input type="number" step="0.01" {...register(`batches.${index}.landingRate`, { valueAsNumber: true })} className="bg-indigo-50 border-indigo-200" />
                                                        </Field>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    </ScrollArea>

                    <DialogFooter className="border-t px-6 py-4 bg-slate-50/80">
                        <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={saving || !isDirty}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-32"
                        >
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                                    Saving…
                                </span>
                            ) : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Section({
    icon, title, children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</span>
            </div>
            {children}
        </div>
    );
}

function Field({
    label, children, error, hint, className,
}: {
    label: string;
    children: React.ReactNode;
    error?: string;
    hint?: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <Label className="text-xs font-medium text-slate-600 mb-1.5 block">{label}</Label>
            {children}
            {hint && !error && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
        </div>
    );
}
