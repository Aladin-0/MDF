'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { attendanceApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { MapPin, Wifi, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export function SmartCheckInBanner() {
    const { user, outlet } = useAuthStore();
    const { enableAttendance, attendanceRadiusMeters } = useSettingsStore();
    const { toast } = useToast();

    const [status, setStatus] = useState<'none' | 'checked_in' | 'checked_out' | null>(null);
    const [isCheckingIn, setIsCheckingIn] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        if (!enableAttendance || !outlet || !user) {
            setStatus('checked_out'); // Hide banner if disabled or not ready
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

    const handleCheckIn = async () => {
        if (!outlet || !user) return;
        setIsCheckingIn(true);

        const payload: any = {
            outletId: outlet.id,
            staffId: user.id,
            type: 'check_in',
        };

        const executeCheckIn = async (withGps = false) => {
            try {
                await attendanceApi.checkIn(payload);
                setStatus('checked_in');
                toast({
                    title: 'Checked in successfully!',
                    description: `Attendance marked at ${format(new Date(), 'hh:mm a')}`,
                });
                setIsCheckingIn(false);
            } catch (error: any) {
                // If it failed because of IP, and we haven't tried GPS yet, try GPS
                const errCode = error?.error?.code;
                if (!withGps && errCode === 'SECURITY_REJECTED' && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            payload.latitude = position.coords.latitude;
                            payload.longitude = position.coords.longitude;
                            executeCheckIn(true);
                        },
                        (gpsError) => {
                            toast({
                                variant: 'destructive',
                                title: 'Check-in Failed',
                                description: error?.error?.message || 'Failed to mark attendance. Are you connected to the store Wi-Fi?',
                            });
                            setIsCheckingIn(false);
                        },
                        { timeout: 15000 }
                    );
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Check-in Failed',
                        description: error?.error?.message || 'Failed to mark attendance. Are you connected to the store Wi-Fi?',
                    });
                    setIsCheckingIn(false);
                }
            }
        };

        executeCheckIn(false);
    };

    const handleCheckOut = async () => {
        if (!outlet || !user) return;
        setIsCheckingOut(true);

        const payload: any = {
            outletId: outlet.id,
            staffId: user.id,
            type: 'check_out',
        };

        const executeCheckOut = async (withGps = false) => {
            try {
                await attendanceApi.checkOut(payload);
                setStatus('checked_out');
                toast({
                    title: 'Checked out successfully!',
                    description: `See you tomorrow!`,
                });
                setIsCheckingOut(false);
            } catch (error: any) {
                const errCode = error?.error?.code;
                if (!withGps && errCode === 'SECURITY_REJECTED' && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            payload.latitude = position.coords.latitude;
                            payload.longitude = position.coords.longitude;
                            executeCheckOut(true);
                        },
                        (gpsError) => {
                            toast({
                                variant: 'destructive',
                                title: 'Check-out Failed',
                                description: error?.error?.message || 'Failed to mark checkout.',
                            });
                            setIsCheckingOut(false);
                        },
                        { timeout: 15000 }
                    );
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Check-out Failed',
                        description: error?.error?.message || 'Failed to mark checkout.',
                    });
                    setIsCheckingOut(false);
                }
            }
        };

        executeCheckOut(false);
    };

    if (status === null || status === 'checked_out' || isDismissed) return null;

    if (status === 'checked_in') {
        return (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm z-40 relative">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-full">
                        <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-blue-900">
                            You are checked in
                        </h3>
                        <p className="text-xs text-blue-700 mt-0.5">
                            Don't forget to check out before leaving today.
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 self-stretch sm:self-auto">
                    <Button 
                        onClick={handleCheckOut} 
                        disabled={isCheckingOut}
                        className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto shadow-sm"
                        size="sm"
                    >
                        {isCheckingOut ? 'Verifying...' : 'Check Out Now'}
                    </Button>
                    <button onClick={() => setIsDismissed(true)} className="ml-2 text-blue-400 hover:text-blue-600 p-1">
                        &times;
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm z-40 relative">
            <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-full">
                    <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-amber-900">
                        You haven't checked in today
                    </h3>
                    <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <Wifi className="w-3 h-3" /> Connect to outlet Wi-Fi OR 
                        <MapPin className="w-3 h-3 ml-1" /> Be within {attendanceRadiusMeters || 100}m of the store.
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <Button 
                    onClick={handleCheckIn} 
                    disabled={isCheckingIn}
                    className="bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto shadow-sm"
                    size="sm"
                >
                    {isCheckingIn ? 'Verifying Location...' : 'Mark Present Now'}
                </Button>
                <button onClick={() => setIsDismissed(true)} className="ml-2 text-amber-400 hover:text-amber-600 p-1 text-lg font-medium leading-none">
                    &times;
                </button>
            </div>
        </div>
    );
}
