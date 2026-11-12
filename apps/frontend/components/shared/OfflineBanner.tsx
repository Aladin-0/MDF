'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsOffline(!navigator.onLine);
        }

        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2 px-4 text-sm text-center text-white bg-red-500">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
                No internet connection — bills cannot be saved. Do NOT dispense medicines until connection is restored.
            </span>
        </div>
    );
}
