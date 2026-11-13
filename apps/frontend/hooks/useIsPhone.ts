'use client';

import { useEffect, useState } from 'react';

/** Phone layout breakpoint: tablets (768px and up) keep the desktop/tablet billing screen. */
export const PHONE_MAX_WIDTH = 767;

/**
 * True on a phone-width window. `null` until the browser has been asked (first render), so the page can show a neutral
 * placeholder instead of flashing the wrong layout. Follows the window if it is resized or rotated.
 */
export function useIsPhone(): boolean | null {
    const [isPhone, setIsPhone] = useState<boolean | null>(null);
    useEffect(() => {
        // no matchMedia (very old browser, test environment): treat it as a larger screen and show the standard layout
        if (typeof window.matchMedia !== 'function') { setIsPhone(false); return; }
        const mq = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
        const apply = () => setIsPhone(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);
    return isPhone;
}
