'use client';

import { useEffect, useState } from 'react';

/** Whether the browser says we are online (saving a bill or a purchase is impossible offline, so the main button says so). */
export function useIsOnline(): boolean {
    const [online, setOnline] = useState(true);
    useEffect(() => {
        setOnline(navigator.onLine);
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return online;
}
