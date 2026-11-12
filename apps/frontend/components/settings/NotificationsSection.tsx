'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/use-toast';
import { notificationSettingsSchema, type NotificationSettingsFormValues } from '@/lib/validations/settings';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';

interface NotificationsSectionProps {
    onDirty: () => void;
    onSaved: () => void;
    discardKey?: number;
}

export function NotificationsSection({ onDirty, onSaved, discardKey }: NotificationsSectionProps) {
    const store = useSettingsStore();
    const { toast } = useToast();

    const getDefaults = (): NotificationSettingsFormValues => ({
        notifyLowStock: store.notifyLowStock,
        lowStockThreshold: store.lowStockThreshold,
        notifyExpiryDays: store.notifyExpiryDays,
        notifyOverdueCredit: store.notifyOverdueCredit,
        notifyRefillDue: store.notifyRefillDue,
        whatsappNotifications: store.whatsappNotifications,
    });

    const { handleSubmit, watch, setValue, register, reset, formState: { isDirty, errors } } =
        useForm<NotificationSettingsFormValues>({
            resolver: zodResolver(notificationSettingsSchema),
            defaultValues: getDefaults(),
        });

    useEffect(() => {
        if (discardKey !== undefined) reset(getDefaults());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discardKey]);

    useEffect(() => {
        if (isDirty) onDirty();
    }, [isDirty, onDirty]);

    const notifyLowStock = watch('notifyLowStock');
    const notifyExpiry = watch('notifyExpiryDays');
    const whatsapp = watch('whatsappNotifications');

    function onSubmit(data: NotificationSettingsFormValues) {
        store.updateNotificationSettings(data);
        toast({ title: 'Notification settings saved' });
        onSaved();
        reset(data);
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <SettingsSectionHeader
                icon={<Bell />}
                title="Notifications & Alerts"
                description="Control which alerts appear on your dashboard and sidebar."
            />

            {/* Dashboard Alerts */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800 mb-3">Dashboard Alert Settings</p>

                <SettingsToggleRow
                    label="Low stock alerts"
                    description="Alert when inventory falls below the threshold"
                    checked={notifyLowStock}
                    onCheckedChange={(v) => setValue('notifyLowStock', v, { shouldDirty: true })}
                />
                {notifyLowStock && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-2 py-2">
                        <Label htmlFor="lowStockThreshold" className="text-sm text-slate-600 whitespace-nowrap">
                            Alert when stock falls below:
                        </Label>
                        <Input
                            id="lowStockThreshold"
                            type="number"
                            min={1}
                            max={100}
                            className="w-20"
                            {...register('lowStockThreshold', { valueAsNumber: true })}
                        />
                        <span className="text-sm text-slate-500">strips</span>
                        {errors.lowStockThreshold && (
                            <p className="text-xs text-red-500">{errors.lowStockThreshold.message}</p>
                        )}
                    </div>
                )}

                <SettingsToggleRow
                    label="Expiry alerts"
                    description="Alert for medicines expiring soon"
                    checked={notifyExpiry > 0}
                    onCheckedChange={(v) => {
                        setValue('notifyExpiryDays', v ? store.notifyExpiryDays || 90 : 0, { shouldDirty: true });
                    }}
                />
                {notifyExpiry > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-2 py-2">
                        <Label htmlFor="notifyExpiryDays" className="text-sm text-slate-600 whitespace-nowrap">
                            Alert for medicines expiring within:
                        </Label>
                        <Input
                            id="notifyExpiryDays"
                            type="number"
                            min={7}
                            max={365}
                            className="w-20"
                            {...register('notifyExpiryDays', { valueAsNumber: true })}
                        />
                        <span className="text-sm text-slate-500">days</span>
                        {errors.notifyExpiryDays && (
                            <p className="text-xs text-red-500">{errors.notifyExpiryDays.message}</p>
                        )}
                    </div>
                )}

                <SettingsToggleRow
                    label="Overdue credit alerts"
                    description="Alert when customer credit is overdue"
                    checked={watch('notifyOverdueCredit')}
                    onCheckedChange={(v) => setValue('notifyOverdueCredit', v, { shouldDirty: true })}
                />

                <SettingsToggleRow
                    label="Chronic refill reminders"
                    description="Alert when chronic patient refill is due"
                    checked={watch('notifyRefillDue')}
                    onCheckedChange={(v) => setValue('notifyRefillDue', v, { shouldDirty: true })}
                />
            </div>

            {/* WhatsApp Notifications */}
            <div className="rounded-xl border bg-white p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">WhatsApp Integration</p>

                <SettingsToggleRow
                    label="Enable WhatsApp notifications"
                    checked={whatsapp}
                    onCheckedChange={(v) => setValue('whatsappNotifications', v, { shouldDirty: true })}
                    icon={<MessageCircle className="text-green-600" />}
                />

                {whatsapp && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                        <p className="text-sm font-medium text-green-800">WhatsApp Business API</p>
                        <p className="text-xs text-green-700">
                            For now, WhatsApp links open manually when you click the WhatsApp button in Credit or Customers screens.
                        </p>
                        <div className="space-y-1 pt-1">
                            <p className="text-xs text-green-700">✓ Manual reminder links work</p>
                            <p className="text-xs text-green-700">✓ Payment receipt links work</p>
                            <p className="text-xs text-green-500">⏳ Auto-notifications — coming in Phase 2</p>
                        </div>
                    </div>
                )}
            </div>

            <Button type="submit" className="w-full sm:w-auto">
                Save Notification Settings
            </Button>
        </form>
    );
}
