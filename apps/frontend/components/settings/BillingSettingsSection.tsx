'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingCart, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/use-toast';
import { billingSettingsSchema, type BillingSettingsFormValues } from '@/lib/validations/settings';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';

const TIMEOUT_OPTIONS = [
    { value: 5, label: '5 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 480, label: 'Never' },
];

interface BillingSettingsSectionProps {
    onDirty: () => void;
    onSaved: () => void;
    discardKey?: number;
}

export function BillingSettingsSection({ onDirty, onSaved, discardKey }: BillingSettingsSectionProps) {
    const store = useSettingsStore();
    const { toast } = useToast();

    const getDefaults = (): BillingSettingsFormValues => ({
        defaultDiscountPct: store.defaultDiscountPct,
        allowNegativeStock: store.allowNegativeStock,
        requirePinForEveryBill: store.requirePinForEveryBill,
        pinSessionTimeoutMins: store.pinSessionTimeoutMins,
        enableLooseTablets: store.enableLooseTablets,
        defaultQuantityMode: (store.defaultQuantityMode ?? 'loose') as 'strip' | 'loose',
        enableCreditSales: store.enableCreditSales,
        creditWarningThresholdPct: store.creditWarningThresholdPct,
        enableWhatsAppReceipt: store.enableWhatsAppReceipt,
    });

    const { handleSubmit, watch, setValue, reset, formState: { isDirty } } =
        useForm<BillingSettingsFormValues>({
            resolver: zodResolver(billingSettingsSchema),
            defaultValues: getDefaults(),
        });

    useEffect(() => {
        if (discardKey !== undefined) reset(getDefaults());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discardKey]);

    useEffect(() => {
        if (isDirty) onDirty();
    }, [isDirty, onDirty]);

    const defaultDiscountPct = watch('defaultDiscountPct');
    const requirePin = watch('requirePinForEveryBill');
    const allowNegativeStock = watch('allowNegativeStock');
    const enableCreditSales = watch('enableCreditSales');
    const creditThreshold = watch('creditWarningThresholdPct');
    const pinTimeout = watch('pinSessionTimeoutMins');

    function onSubmit(data: BillingSettingsFormValues) {
        store.updateBillingSettings(data);
        toast({ title: 'Billing settings saved' });
        onSaved();
        reset(data);
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <SettingsSectionHeader
                icon={<ShoppingCart />}
                title="Billing Settings"
                description="Control billing behavior, discount rules, and credit policies."
            />

            {/* Discount Settings */}
            <div className="rounded-xl border bg-white p-4 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Discount Policy</p>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Default Discount %</Label>
                        <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {defaultDiscountPct}%
                        </span>
                    </div>
                    <Slider
                        min={0}
                        max={30}
                        step={1}
                        value={[defaultDiscountPct]}
                        onValueChange={([val]) => setValue('defaultDiscountPct', val, { shouldDirty: true })}
                    />
                    <p className="text-xs text-muted-foreground">
                        Applied to all walk-in customers without a fixed discount
                    </p>
                </div>
                <div className="flex items-start gap-3 bg-blue-50 rounded-lg p-3">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                        Individual staff discount limits are set in Staff Management → each member&apos;s Max Discount setting.
                    </p>
                </div>
            </div>

            {/* PIN & Security */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800 mb-3">PIN & Session Security</p>
                <SettingsToggleRow
                    label="Require PIN for every bill"
                    description="Staff must enter PIN before starting each billing session"
                    checked={requirePin}
                    onCheckedChange={(v) => setValue('requirePinForEveryBill', v, { shouldDirty: true })}
                    warningMessage="Turning this off allows billing without PIN verification."
                />
                {requirePin && (
                    <div className="space-y-1.5 pt-2">
                        <Label>PIN Session Timeout</Label>
                        <Select
                            value={String(pinTimeout)}
                            onValueChange={(val) => setValue('pinSessionTimeoutMins', Number(val), { shouldDirty: true })}
                        >
                            <SelectTrigger className="w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TIMEOUT_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={String(opt.value)}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            PIN re-entry required after this period of inactivity
                        </p>
                    </div>
                )}
            </div>

            {/* Stock Behavior */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800 mb-3">Stock Behavior</p>
                <SettingsToggleRow
                    label="Allow negative stock"
                    description="Bills can be created even when stock is zero. Use with caution."
                    checked={allowNegativeStock}
                    onCheckedChange={(v) => setValue('allowNegativeStock', v, { shouldDirty: true })}
                />
                {allowNegativeStock && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                        <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                            Bills can be created even when stock is zero. Use with caution.
                        </p>
                    </div>
                )}
                <SettingsToggleRow
                    label="Enable loose tablet billing"
                    description="Allow selling individual tablets in addition to full strips"
                    checked={watch('enableLooseTablets')}
                    onCheckedChange={(v) => setValue('enableLooseTablets', v, { shouldDirty: true })}
                />

                {/* Default Quantity Mode */}
                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="text-sm font-medium text-slate-800">Default Quantity Mode</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Which unit is pre-selected when a medicine is added to billing</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setValue('defaultQuantityMode', 'strip', { shouldDirty: true })}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                                watch('defaultQuantityMode') === 'strip'
                                    ? 'bg-white shadow text-slate-900'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Strips
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue('defaultQuantityMode', 'loose', { shouldDirty: true })}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                                watch('defaultQuantityMode') === 'loose'
                                    ? 'bg-white shadow text-slate-900'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Loose (Strips)
                        </button>
                    </div>
                </div>
            </div>

            {/* Credit Settings */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800 mb-3">Credit & Udhari</p>
                <SettingsToggleRow
                    label="Enable credit sales"
                    description="Allow billing on credit (Udhari)"
                    checked={enableCreditSales}
                    onCheckedChange={(v) => setValue('enableCreditSales', v, { shouldDirty: true })}
                />
                {enableCreditSales && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-sm font-medium">Credit Warning Threshold</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Show warning when customer reaches {creditThreshold}% of their credit limit
                                </p>
                            </div>
                            <span className="text-sm font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                {creditThreshold}%
                            </span>
                        </div>
                        <Slider
                            min={50}
                            max={100}
                            step={5}
                            value={[creditThreshold]}
                            onValueChange={([val]) => setValue('creditWarningThresholdPct', val, { shouldDirty: true })}
                        />
                        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="absolute left-0 top-0 h-full bg-green-400 rounded-full"
                                style={{ width: `${creditThreshold}%` }}
                            />
                            <div
                                className="absolute top-0 h-full w-0.5 bg-amber-500"
                                style={{ left: `${creditThreshold}%` }}
                            />
                        </div>
                    </div>
                )}
                <SettingsToggleRow
                    label="Send WhatsApp receipt after payment"
                    description="Open WhatsApp link after recording credit payment"
                    checked={watch('enableWhatsAppReceipt')}
                    onCheckedChange={(v) => setValue('enableWhatsAppReceipt', v, { shouldDirty: true })}
                />
            </div>

            <Button type="submit" className="w-full sm:w-auto">
                Save Billing Settings
            </Button>
        </form>
    );
}
