'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { productsApi } from '@/lib/apiClient';
import { CreateProductPayload, ProductSearchResult } from '@/types';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';
import { PACK_TYPE_OPTIONS } from '@/constants/productBehavior';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    onSuccess: (product: ProductSearchResult) => void;
}

interface FormState {
    name: string;
    composition: string;
    manufacturer: string;
    hsnCode: string;
    gstRate: string;
    packSize: string;
    packUnit: string;
    packType: string;
    scheduleType: string;
    mrp: string;
}

interface FieldErrors {
    name?: string;
    hsnCode?: string;
    gstRate?: string;
    packSize?: string;
    packUnit?: string;
    packType?: string;
    scheduleType?: string;
    mrp?: string;
}

const PACK_UNITS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Powder', 'Strip', 'Piece', 'ml', 'gm'];
const GST_RATES = ['0', '5', '12', '18', '28'];

const emptyForm = (name = ''): FormState => ({
    name,
    composition: '',
    manufacturer: '',
    hsnCode: '',
    gstRate: '',
    packSize: '1',
    packUnit: '',
    packType: 'strip',
    scheduleType: '',
    mrp: '',
});

export function AddNewProductDrawer({ open, onOpenChange, initialName, onSuccess }: Props) {
    const [form, setForm] = useState<FormState>(emptyForm(initialName));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [serverError, setServerError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setForm(emptyForm(initialName));
            setErrors({});
            setServerError('');
        }
    }, [open, initialName]);

    const set = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field as keyof FieldErrors]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const validate = (): boolean => {
        const errs: FieldErrors = {};
        if (!form.name.trim()) errs.name = 'Product name is required';
        if (!form.hsnCode.trim()) errs.hsnCode = 'HSN code is required';
        if (form.gstRate === '') errs.gstRate = 'GST rate is required';
        const packSize = parseInt(form.packSize);
        if (!packSize || packSize < 1) errs.packSize = 'Pack size must be ≥ 1';
        if (!form.packUnit) errs.packUnit = 'Pack unit is required';
        if (!form.packType) errs.packType = 'Stock behavior is required';
        if (!form.scheduleType) errs.scheduleType = 'Schedule type is required';
        const mrp = parseFloat(form.mrp);
        if (!mrp || mrp <= 0) errs.mrp = 'MRP must be > 0';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        setServerError('');
        try {
            const payload: CreateProductPayload = {
                name: form.name.trim(),
                composition: form.composition.trim() || undefined,
                manufacturer: form.manufacturer.trim() || undefined,
                hsnCode: form.hsnCode.trim(),
                gstRate: parseFloat(form.gstRate),
                packSize: parseInt(form.packSize),
                packUnit: form.packUnit,
                packType: form.packType,
                scheduleType: form.scheduleType,
                mrp: parseFloat(form.mrp),
                saleRate: parseFloat(form.mrp),
            };
            const product = await productsApi.create(payload);
            onSuccess(product);
            onOpenChange(false);
        } catch (err: unknown) {
            if (err instanceof Error) {
                try {
                    const body = JSON.parse(err.message);
                    if (body?.errors) {
                        const fieldErrs: FieldErrors = {};
                        for (const [k, v] of Object.entries(body.errors)) {
                            fieldErrs[k as keyof FieldErrors] = String(v);
                        }
                        setErrors(fieldErrs);
                        return;
                    }
                } catch {
                    // not JSON
                }
                setServerError(err.message || 'Failed to create product');
            } else {
                setServerError('Failed to create product');
            }
        } finally {
            setSaving(false);
        }
    };

    const fieldCls = (err?: string) =>
        `h-9 text-sm ${err ? 'border-red-400 focus-visible:ring-red-300' : ''}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl flex flex-col gap-0 p-0 max-h-[90vh]">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle className="text-lg">Add New Product</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-8">
                        {serverError && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {serverError}
                            </div>
                        )}

                        {/* Section A: Product Details */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold tracking-tight text-gray-500 uppercase">A. Product Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1 md:col-span-2">
                                    <Label className="text-xs font-medium">Product Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        className={fieldCls(errors.name)}
                                        value={form.name}
                                        onChange={(e) => set('name', e.target.value)}
                                        placeholder="e.g. Dolo 650"
                                    />
                                    {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">Composition</Label>
                                    <Input
                                        className="h-9 text-sm"
                                        value={form.composition}
                                        onChange={(e) => set('composition', e.target.value)}
                                        placeholder="e.g. Paracetamol 650mg"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">Manufacturer</Label>
                                    <Input
                                        className="h-9 text-sm"
                                        value={form.manufacturer}
                                        onChange={(e) => set('manufacturer', e.target.value)}
                                        placeholder="e.g. Micro Labs Ltd"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section B: Tax & Compliance */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold tracking-tight text-gray-500 uppercase">B. Tax & Compliance</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">HSN Code <span className="text-red-500">*</span></Label>
                                    <Input
                                        className={fieldCls(errors.hsnCode)}
                                        value={form.hsnCode}
                                        onChange={(e) => set('hsnCode', e.target.value.slice(0, 8))}
                                        placeholder="e.g. 30049099"
                                        maxLength={8}
                                    />
                                    {errors.hsnCode && <p className="text-[11px] text-red-500">{errors.hsnCode}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">GST % <span className="text-red-500">*</span></Label>
                                    <Select value={form.gstRate} onValueChange={(v) => set('gstRate', v)}>
                                        <SelectTrigger className={`h-9 text-sm ${errors.gstRate ? 'border-red-400' : ''}`}>
                                            <SelectValue placeholder="Select GST" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GST_RATES.map((r) => (
                                                <SelectItem key={r} value={r}>{r}%</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.gstRate && <p className="text-[11px] text-red-500">{errors.gstRate}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">Schedule Type <span className="text-red-500">*</span></Label>
                                    <Select value={form.scheduleType} onValueChange={(v) => set('scheduleType', v)}>
                                        <SelectTrigger className={`h-9 text-sm ${errors.scheduleType ? 'border-red-400' : ''}`}>
                                            <SelectValue placeholder="Select Schedule" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.scheduleType && <p className="text-[11px] text-red-500">{errors.scheduleType}</p>}
                                </div>
                            </div>
                        </section>

                        {/* Section C: Product Form */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold tracking-tight text-gray-500 uppercase">C. Product Form</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">Pack Type <span className="text-red-500">*</span></Label>
                                    <Select value={form.packType} onValueChange={(v) => {
                                        set('packType', v);
                                        if (v === 'strip' || v === 'blister') { 
                                            set('packUnit', 'Tablet'); 
                                            set('packSize', '10'); 
                                        } else { 
                                            set('packUnit', PACK_TYPE_OPTIONS.find(o => o.value === v)?.label || 'Piece'); 
                                            set('packSize', '1'); 
                                        }
                                    }}>
                                        <SelectTrigger className={`h-9 text-sm ${errors.packType ? 'border-red-400' : ''}`}>
                                            <SelectValue placeholder="Select Pack Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PACK_TYPE_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.packType && <p className="text-[11px] text-red-500">{errors.packType}</p>}
                                </div>
                            </div>
                        </section>

                        {/* Section D: Unit Structure */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold tracking-tight text-gray-500 uppercase">D. Unit Structure</h3>
                            <div className="bg-indigo-50/50 p-4 rounded-md border border-indigo-100">
                                {(form.packType === 'strip' || form.packType === 'blister') ? (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm text-gray-600 mb-2">Define how this product is packaged. <span className="font-semibold text-gray-800">Example: 1 Strip contains 10 Tablets.</span></p>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium">1 {form.packType ? (PACK_TYPE_OPTIONS.find(o => o.value === form.packType)?.label || form.packType) : 'Pack'} contains</span>
                                            <div className="w-24">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    className={fieldCls(errors.packSize)}
                                                    value={form.packSize}
                                                    onChange={(e) => set('packSize', e.target.value)}
                                                    placeholder="Qty"
                                                />
                                            </div>
                                            <div className="w-32">
                                                <Input
                                                    className={fieldCls(errors.packUnit)}
                                                    value={form.packUnit}
                                                    onChange={(e) => set('packUnit', e.target.value)}
                                                    placeholder="Base Unit"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="w-24 pl-[108px]">{errors.packSize && <p className="text-[11px] text-red-500">{errors.packSize}</p>}</div>
                                            <div className="w-32 pl-4">{errors.packUnit && <p className="text-[11px] text-red-500">{errors.packUnit}</p>}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm text-gray-600 mb-2">This product is tracked as a packaged unit (e.g., 1 Bottle).</p>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium">Package Size & Name</span>
                                            <div className="w-24">
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    className={fieldCls(errors.packSize)}
                                                    value={form.packSize}
                                                    onChange={(e) => set('packSize', e.target.value)}
                                                    placeholder="Qty"
                                                />
                                            </div>
                                            <div className="w-32">
                                                <Input
                                                    className={fieldCls(errors.packUnit)}
                                                    value={form.packUnit}
                                                    onChange={(e) => set('packUnit', e.target.value)}
                                                    placeholder="Unit Name"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="w-24 pl-[148px]">{errors.packSize && <p className="text-[11px] text-red-500">{errors.packSize}</p>}</div>
                                            <div className="w-32 pl-4">{errors.packUnit && <p className="text-[11px] text-red-500">{errors.packUnit}</p>}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Section E: Pricing */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold tracking-tight text-gray-500 uppercase">E. Pricing</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium">MRP (₹) <span className="text-red-500">*</span></Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        className={fieldCls(errors.mrp)}
                                        value={form.mrp}
                                        onChange={(e) => set('mrp', e.target.value)}
                                        placeholder="0.00"
                                    />
                                    {errors.mrp && <p className="text-[11px] text-red-500">{errors.mrp}</p>}
                                </div>
                            </div>
                        </section>

                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="border-t px-6 py-4 bg-gray-50 flex items-center justify-end gap-2 rounded-b-lg">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : 'Save & Add to Row'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
