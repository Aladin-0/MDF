'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Camera, ExternalLink, ShieldCheck, MapPin, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { settingsApi, attendanceApi } from '@/lib/apiClient';
import { attendanceSettingsSchema, type AttendanceSettingsFormValues } from '@/lib/validations/settings';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingsToggleRow } from './SettingsToggleRow';

interface AttendanceSettingsSectionProps {
    onDirty: () => void;
    onSaved: () => void;
    discardKey?: number;
}

export function AttendanceSettingsSection({ onDirty, onSaved, discardKey }: AttendanceSettingsSectionProps) {
    const store = useSettingsStore();
    const { outlet } = useAuthStore();
    const { toast } = useToast();

    const getDefaults = (): AttendanceSettingsFormValues => ({
        attendanceGraceMinutes: store.attendanceGraceMinutes,
        kioskPhotoCapture: store.kioskPhotoCapture,
        kioskAutoResetSeconds: store.kioskAutoResetSeconds,
        enableAttendance: store.enableAttendance,
        workingHoursPerDay: store.workingHoursPerDay,
        allowedAttendanceIps: store.allowedAttendanceIps || '',
        attendanceLatitude: store.attendanceLatitude || '',
        attendanceLongitude: store.attendanceLongitude || '',
        attendanceRadiusMeters: store.attendanceRadiusMeters || 100,
    });

    const { handleSubmit, watch, setValue, register, reset, formState: { isDirty, errors } } =
        useForm<AttendanceSettingsFormValues>({
            resolver: zodResolver(attendanceSettingsSchema),
            defaultValues: getDefaults(),
        });

    useEffect(() => {
        if (discardKey !== undefined) reset(getDefaults());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [discardKey]);

    useEffect(() => {
        if (isDirty) onDirty();
    }, [isDirty, onDirty]);

    const enableAttendance = watch('enableAttendance');
    const graceMinutes = watch('attendanceGraceMinutes');
    const autoResetSeconds = watch('kioskAutoResetSeconds');

    async function onSubmit(data: AttendanceSettingsFormValues) {
        // Persist security settings to the backend server
        if (outlet) {
            try {
                await settingsApi.updateSettings(outlet.id, {
                    allowedAttendanceIps: data.allowedAttendanceIps || '',
                    attendanceLatitude: data.attendanceLatitude || null,
                    attendanceLongitude: data.attendanceLongitude || null,
                    attendanceRadiusMeters: data.attendanceRadiusMeters ?? 100,
                });
            } catch {
                toast({ variant: 'destructive', title: 'Failed to save security settings to server.' });
                return;
            }
        }
        store.updateAttendanceSettings(data);
        toast({ title: 'Attendance settings saved' });
        onSaved();
        reset(data);
    }

    const captureIP = async () => {
        try {
            const data = await attendanceApi.getMyIp();
            setValue('allowedAttendanceIps', data.ip, { shouldDirty: true });
            toast({ title: 'Current IP captured' });
        } catch {
            toast({ title: 'Failed to capture IP', variant: 'destructive' });
        }
    };

    const captureLocation = () => {
        if (!navigator.geolocation) {
            toast({ title: 'Geolocation is not supported by your browser', variant: 'destructive' });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setValue('attendanceLatitude', String(position.coords.latitude.toFixed(7)), { shouldDirty: true });
                setValue('attendanceLongitude', String(position.coords.longitude.toFixed(7)), { shouldDirty: true });
                toast({ title: 'Current GPS Location captured' });
            },
            () => {
                toast({ title: 'Unable to retrieve your location', variant: 'destructive' });
            }
        );
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <SettingsSectionHeader
                icon={<Clock />}
                title="Attendance Settings"
                description="Configure the kiosk mode and attendance tracking rules."
            />

            {/* Enable Attendance */}
            <div className="rounded-xl border bg-white px-4">
                <SettingsToggleRow
                    label="Enable attendance tracking"
                    description="When disabled, the attendance section is hidden from the sidebar"
                    checked={enableAttendance}
                    onCheckedChange={(v) => setValue('enableAttendance', v, { shouldDirty: true })}
                    warningMessage="Staff check-in data will not be recorded when attendance is disabled."
                />
            </div>

            {/* Grace Period */}
            <div className="rounded-xl border bg-white p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-sm font-medium">Late Arrival Grace Period</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Staff arriving within this window are marked &quot;Present&quot; instead of &quot;Late&quot;
                        </p>
                    </div>
                    <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {graceMinutes} min
                    </span>
                </div>
                <Slider
                    min={0}
                    max={60}
                    step={5}
                    value={[graceMinutes]}
                    onValueChange={([val]) => setValue('attendanceGraceMinutes', val, { shouldDirty: true })}
                />
                {/* Timeline visual */}
                <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500">Shift start</span>
                    <div className="flex-1 h-1.5 bg-green-200 rounded-full relative mx-2">
                        <div
                            className="absolute left-0 top-0 h-full bg-amber-300 rounded-full"
                            style={{ width: `${(graceMinutes / 60) * 100}%` }}
                        />
                    </div>
                    <span className="text-slate-400">+{graceMinutes}m</span>
                    <div className="w-4 h-1.5 bg-red-200 rounded-full mx-1" />
                    <span className="text-red-400">Late</span>
                </div>
            </div>

            {/* Kiosk Settings */}
            <div className="rounded-xl border bg-white p-4 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Kiosk Mode</p>

                <div className="divide-y">
                    <SettingsToggleRow
                        label="Capture photo on check-in/out"
                        description="Takes webcam photo for verification"
                        checked={watch('kioskPhotoCapture')}
                        onCheckedChange={(v) => setValue('kioskPhotoCapture', v, { shouldDirty: true })}
                        icon={<Camera />}
                        className="border-b-0"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-sm font-medium">Auto-reset timer</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Return to home screen after {autoResetSeconds}s of inactivity
                            </p>
                        </div>
                        <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {autoResetSeconds}s
                        </span>
                    </div>
                    <Slider
                        min={3}
                        max={30}
                        step={1}
                        value={[autoResetSeconds]}
                        onValueChange={([val]) => setValue('kioskAutoResetSeconds', val, { shouldDirty: true })}
                    />
                </div>

                <a
                    href="/dashboard/attendance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                    Open Kiosk Mode
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>

            {/* Working Hours */}
            <div className="rounded-xl border bg-white p-4 space-y-2">
                <Label htmlFor="workingHoursPerDay" className="text-sm font-medium">
                    Standard working hours per day
                </Label>
                <Input
                    id="workingHoursPerDay"
                    type="number"
                    min={4}
                    max={12}
                    className="w-24"
                    {...register('workingHoursPerDay', { valueAsNumber: true })}
                />
                {errors.workingHoursPerDay && (
                    <p className="text-xs text-red-500">{errors.workingHoursPerDay.message}</p>
                )}
                <p className="text-xs text-muted-foreground">Used to calculate attendance percentage</p>
            </div>

            {/* Attendance Security (Dual Validation) */}
            <div className="rounded-xl border bg-white p-4 space-y-6">
                <p className="text-sm font-semibold text-slate-800">Security & Restrictions (Dual Validation)</p>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="allowedAttendanceIps" className="text-sm font-medium">
                            Allowed Wi-Fi IP Addresses (Primary Check)
                        </Label>
                        <Button type="button" variant="outline" size="sm" onClick={captureIP}>
                            Capture Current IP
                        </Button>
                    </div>
                    <Input
                        id="allowedAttendanceIps"
                        placeholder="e.g. 192.168.1.1, 45.123.x.x"
                        {...register('allowedAttendanceIps')}
                    />
                    <p className="text-xs text-muted-foreground">Staff check-ins are instantly approved if they are connected to these IPs.</p>
                </div>

                <div className="space-y-4 pt-4 border-t">
                    <div className="flex justify-between items-center">
                        <Label className="text-sm font-medium">GPS Geofencing (Fallback Check)</Label>
                        <Button type="button" variant="outline" size="sm" onClick={captureLocation}>
                            Capture Current Location
                        </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="attendanceLatitude" className="text-xs text-muted-foreground">Latitude</Label>
                            <Input id="attendanceLatitude" {...register('attendanceLatitude')} placeholder="e.g. 19.0760" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="attendanceLongitude" className="text-xs text-muted-foreground">Longitude</Label>
                            <Input id="attendanceLongitude" {...register('attendanceLongitude')} placeholder="e.g. 72.8777" />
                        </div>
                    </div>
                    
                    <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Allowed Radius</Label>
                            <span className="text-sm font-semibold text-primary">{watch('attendanceRadiusMeters') || 100} meters</span>
                        </div>
                        <Slider
                            min={10}
                            max={500}
                            step={10}
                            value={[watch('attendanceRadiusMeters') || 100]}
                            onValueChange={([val]) => setValue('attendanceRadiusMeters', val, { shouldDirty: true })}
                        />
                        <p className="text-xs text-muted-foreground">If staff are not on the Wi-Fi, they must be within this circle to check in.</p>
                    </div>
                </div>
            </div>

            <Button type="submit" className="w-full sm:w-auto">
                Save Attendance Settings
            </Button>
        </form>
    );
}
