'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { productsApi } from '@/lib/apiClient';
import { CreateProductPayload, ProductSearchResult, ProductSuggestion } from '@/types';
import { SuggestInput } from '@/components/shared/SuggestInput';
import { SCHEDULE_TYPE_OPTIONS } from '@/constants/scheduleTypes';
import { PACK_TYPE_OPTIONS, DISPENSING_UNIT_OPTIONS } from '@/constants/productBehavior';
import { inferPackUnit } from '@/utils/productUtils';
import { Pencil, Sparkles } from 'lucide-react';

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
    packSize: '10',
    packUnit: 'Tablet',
    packType: 'strip',
    scheduleType: '',
    mrp: '',
});

export function AddNewProductDrawer({ open, onOpenChange, initialName, onSuccess }: Props) {
    const [form, setForm] = useState<FormState>(emptyForm(initialName));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [serverError, setServerError] = useState('');
    const [saving, setSaving] = useState(false);
    // what picking a composition filled in (so the clerk can see it, and it goes away once they change one of those boxes)
    const [filled, setFilled] = useState<{ hsnCode?: string; gstRate?: string; scheduleType?: string; from?: number } | null>(null);

    useEffect(() => {
        if (open) {
            setForm(emptyForm(initialName));
            setErrors({});
            setServerError('');
            setFilled(null);
        }
    }, [open, initialName]);

    const set = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (filled && (field === 'hsnCode' || field === 'gstRate' || field === 'scheduleType') && filled[field]) setFilled((f) => (f ? { ...f, [field]: undefined } : f));
        if (errors[field as keyof FieldErrors]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    /**
     * A composition was picked from the catalogue: fill the HSN, GST and schedule its products usually have, but ONLY the boxes still empty
     * (never over what was typed or chosen), and only values this form can hold. The clerk is told what was filled.
     */
    const onPickComposition = (s: ProductSuggestion) => {
        const next: { hsnCode?: string; gstRate?: string; scheduleType?: string } = {};
        if (!form.hsnCode.trim() && s.hsnCode) next.hsnCode = s.hsnCode.slice(0, 8);
        if (form.gstRate === '' && s.gstRate != null && GST_RATES.includes(String(s.gstRate))) next.gstRate = String(s.gstRate);
        if (!form.scheduleType && s.scheduleType && SCHEDULE_TYPE_OPTIONS.some((o) => o.value === s.scheduleType)) next.scheduleType = s.scheduleType;
        if (!Object.keys(next).length) { setFilled(null); return; }
        setForm((prev) => ({ ...prev, ...next }));
        setErrors((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(next).map((k) => [k, undefined])) }));
        setFilled({ ...next, from: s.count });
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
        } catch (err: any) {
            let errorObj: Record<string, any> | null = null;
            if (err && typeof err === 'object' && err.errors && typeof err.errors === 'object') {
                errorObj = err.errors;
            } else if (err instanceof Error) {
                try {
                    const parsed = JSON.parse(err.message);
                    if (parsed?.errors) errorObj = parsed.errors;
                } catch {
                    // not JSON
                }
            }

            if (errorObj) {
                const fieldErrs: FieldErrors = {};
                for (const [k, v] of Object.entries(errorObj)) {
                    fieldErrs[k as keyof FieldErrors] = Array.isArray(v) ? v.join(', ') : String(v);
                }
                setErrors(fieldErrs);
                const firstMsg = Object.values(fieldErrs)[0];
                setServerError(firstMsg || 'Failed to create product');
                return;
            }

            if (err?.detail) {
                setServerError(String(err.detail));
            } else if (err instanceof Error && err.message) {
                setServerError(err.message);
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
                                    <Label htmlFor="anp-composition" className="text-xs font-medium">Composition</Label>
                                    <SuggestInput
                                        field="composition"
                                        id="anp-composition"
                                        data-testid="composition-input"
                                        className="h-9 text-sm"
                                        value={form.composition}
                                        onChange={(t) => set('composition', t)}
                                        onPick={onPickComposition}
                                        placeholder="e.g. Paracetamol 650mg"
                                    />
                                    <p className="text-[11px] text-muted-foreground">Pick from the list to fill the tax and schedule boxes below.</p>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="anp-manufacturer" className="text-xs font-medium">Manufacturer</Label>
                                    <SuggestInput
                                        field="manufacturer"
                                        id="anp-manufacturer"
                                        data-testid="manufacturer-input"
                                        className="h-9 text-sm"
                                        value={form.manufacturer}
                                        onChange={(t) => set('manufacturer', t)}
                                        placeholder="e.g. Micro Labs Ltd"
                                    />
                                </div>
                                {filled && (filled.hsnCode || filled.gstRate || filled.scheduleType) && (
                                    <p role="status" data-testid="autofill-note" className="md:col-span-2 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                                        <Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>
                                            Filled {[filled.hsnCode && `HSN ${filled.hsnCode}`, filled.gstRate && `GST ${filled.gstRate}%`, filled.scheduleType && `Schedule ${filled.scheduleType}`].filter(Boolean).join(', ')}
                                            {filled.from ? ` from the ${filled.from.toLocaleString('en-IN')} product${filled.from === 1 ? '' : 's'} with this composition` : ''}. Check {(filled.hsnCode ? 1 : 0) + (filled.gstRate ? 1 : 0) + (filled.scheduleType ? 1 : 0) > 1 ? 'them' : 'it'} before saving.
                                        </span>
                                    </p>
                                )}
                            </div>
                        </section>

                        {/* Section B: Tax & Compliance */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-semibold tracking-tight text-gray-500 uppercase">B. Tax & Compliance</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="anp-hsn" className="text-xs font-medium">HSN Code <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="anp-hsn"
                                        className={fieldCls(errors.hsnCode)}
                                        value={form.hsnCode}
                                        onChange={(e) => set('hsnCode', e.target.value.slice(0, 8))}
                                        placeholder="e.g. 30049099"
                                        maxLength={8}
                                    />
                                    {errors.hsnCode && <p className="text-[11px] text-red-500">{errors.hsnCode}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="anp-gst" className="text-xs font-medium">GST % <span className="text-red-500">*</span></Label>
                                    <Select value={form.gstRate} onValueChange={(v) => set('gstRate', v)}>
                                        <SelectTrigger id="anp-gst" className={`h-9 text-sm ${errors.gstRate ? 'border-red-400' : ''}`}>
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
                                    <Label htmlFor="anp-schedule" className="text-xs font-medium">Schedule Type <span className="text-red-500">*</span></Label>
                                    <Select value={form.scheduleType} onValueChange={(v) => set('scheduleType', v)}>
                                        <SelectTrigger id="anp-schedule" className={`h-9 text-sm ${errors.scheduleType ? 'border-red-400' : ''}`}>
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
                                    <Select value={form.packType} onValueChange={(val) => {
                                        set('packType', val);
                                        if (val === 'strip') { 
                                            set('packSize', '10'); 
                                            set('packUnit', 'Tablet'); 
                                        } else if (val === 'box') {
                                            set('packSize', ''); // Clear it so they can type 12, etc.
                                            set('packUnit', 'Strip'); // Sensible default for boxes
                                        } else { 
                                            set('packSize', '1'); 
                                            set('packUnit', 'Piece'); 
                                        }
                                    }}>
                                        <SelectTrigger data-testid="pack-type-trigger" className={`h-9 text-sm ${errors.packType ? 'border-red-400' : ''}`}>
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
                                        <p className="text-sm text-gray-600 mb-2">Define how this product is packaged. <span className="font-semibold text-gray-800">Example: 1 {form.packType ? (PACK_TYPE_OPTIONS.find(o => o.value === form.packType)?.label || form.packType) : 'Strip'} contains 10 {form.packUnit ? form.packUnit + 's' : 'Tablets'}.</span></p>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium">1 {form.packType ? (PACK_TYPE_OPTIONS.find(o => o.value === form.packType)?.label || form.packType) : 'Pack'} contains</span>
                                            <div className="w-24">
                                                <Input
                                                    data-testid="pack-size-input"
                                                    type="number"
                                                    min={1}
                                                    className={fieldCls(errors.packSize)}
                                                    value={form.packSize}
                                                    onChange={(e) => set('packSize', e.target.value)}
                                                    placeholder="Qty"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-[150px]">
                                                <Select value={form.packUnit} onValueChange={(v) => set('packUnit', v)}>
                                                    <SelectTrigger data-testid="pack-unit-trigger" className={fieldCls(errors.packUnit)}>
                                                        <SelectValue placeholder="Select Unit" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {DISPENSING_UNIT_OPTIONS.map(opt => (
                                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="w-24 pl-[108px]">{errors.packSize && <p className="text-[11px] text-red-500">{errors.packSize}</p>}</div>
                                            <div className="flex-1 pl-4">{errors.packUnit && <p className="text-[11px] text-red-500">{errors.packUnit}</p>}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm text-gray-600 mb-2">This product is tracked as a packaged unit (e.g., 1 Bottle).</p>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium">Package Size & Name</span>
                                            <div className="w-24">
                                                <Input
                                                    data-testid="pack-size-input"
                                                    type="number"
                                                    min={1}
                                                    className={fieldCls(errors.packSize)}
                                                    value={form.packSize}
                                                    onChange={(e) => set('packSize', e.target.value)}
                                                    placeholder="Qty"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-[150px]">
                                                <Select value={form.packUnit} onValueChange={(v) => set('packUnit', v)}>
                                                    <SelectTrigger data-testid="pack-unit-trigger" className={fieldCls(errors.packUnit)}>
                                                        <SelectValue placeholder="Select Unit" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {DISPENSING_UNIT_OPTIONS.map(opt => (
                                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="w-24 pl-[148px]">{errors.packSize && <p className="text-[11px] text-red-500">{errors.packSize}</p>}</div>
                                            <div className="flex-1 pl-4">{errors.packUnit && <p className="text-[11px] text-red-500">{errors.packUnit}</p>}</div>
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
                                    <Label htmlFor="anp-mrp" className="text-xs font-medium">MRP (₹) <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="anp-mrp"
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
                <DialogFooter className="border-t px-6 py-4 bg-gray-50 flex items-center justify-end gap-2 rounded-b-lg max-sm:flex-col-reverse max-sm:items-stretch">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="max-sm:h-11 max-sm:w-full"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="max-sm:h-11 max-sm:w-full"
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
