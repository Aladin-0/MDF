'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { attendanceApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export function SmartCheckInAction() {
    const { user, outlet } = useAuthStore();
    const { enableAttendance } = useSettingsStore();
    const { toast } = useToast();

    const [status, setStatus] = useState<'none' | 'checked_in' | 'checked_out' | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!enableAttendance || !outlet || !user) {
            setStatus('checked_out');
            return;
        }

        const checkAttendanceStatus = async () => {
            try {
                const records = await attendanceApi.getTodayRecords(outlet.id);
                const userRecord = records.find((r: any) => r.staffId === user.id);
                if (!userRecord || !userRecord.checkInTime) {
                    setStatus('none');
                } else if (userRecord.checkInTime && !userRecord.checkOutTime) {
                    setStatus('checked_in');
                } else {
                    setStatus('checked_out');
                }
            } catch (error) {
                console.error("Failed to fetch today's attendance", error);
            }
        };

        checkAttendanceStatus();
    }, [enableAttendance, outlet, user]);

    const executeAction = async (type: 'check_in' | 'check_out', payload: any, withGps = false) => {
        setIsLoading(true);
        try {
            if (type === 'check_in') {
                await attendanceApi.checkIn(payload);
                setStatus('checked_in');
                toast({
                    title: 'Checked in successfully!',
                    description: `Attendance marked at ${format(new Date(), 'hh:mm a')}`,
                });
            } else {
                await attendanceApi.checkOut(payload);
                setStatus('checked_out');
                toast({
                    title: 'Checked out successfully!',
                    description: `See you tomorrow!`,
                });
            }
            setIsLoading(false);
        } catch (error: any) {
            const errCode = error?.error?.code;
            if (!withGps && errCode === 'SECURITY_REJECTED' && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        payload.latitude = position.coords.latitude;
                        payload.longitude = position.coords.longitude;
                        executeAction(type, payload, true);
                    },
                    (gpsError) => {
                        toast({
                            variant: 'destructive',
                            title: type === 'check_in' ? 'Check-in Failed' : 'Check-out Failed',
                            description: error?.error?.message || 'Failed to process attendance.',
                        });
                        setIsLoading(false);
                    },
                    { timeout: 15000 }
                );
            } else {
                toast({
                    variant: 'destructive',
                    title: type === 'check_in' ? 'Check-in Failed' : 'Check-out Failed',
                    description: error?.error?.message || 'Failed to process attendance.',
                });
                setIsLoading(false);
            }
        }
    };

    const handleAction = (type: 'check_in' | 'check_out') => {
        if (!outlet || !user) return;
        setIsLoading(true);

        const payload: any = {
            outletId: outlet.id,
            staffId: user.id,
            type,
        };

        executeAction(type, payload, false);
    };

    if (status === null || status === 'checked_out') return null;

    if (status === 'checked_in') {
        return (
            <Button 
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                onClick={() => handleAction('check_out')}
                disabled={isLoading}
            >
                {isLoading ? 'Verifying...' : 'Check Out'}
            </Button>
        );
    }

    return (
        <Button 
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => handleAction('check_in')}
            disabled={isLoading}
        >
            {isLoading ? 'Verifying...' : 'Mark Present'}
        </Button>
    );
}
