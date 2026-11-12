/**
 * A tiny stateful stand-in for the Next.js URL, for component tests.
 *
 *   jest.mock('next/navigation', () => require('../testing/navMock').navigationMock);
 *   setUrl('tab=expiring');  getSearch();  // read what the component wrote
 */
import * as React from 'react';

let search = '';
const listeners = new Set<() => void>();

export const getSearch = () => search;

export function setUrl(qs: string) {
    search = qs;
    window.history.replaceState({}, '', `/dashboard/inventory${qs ? `?${qs}` : ''}`);
    listeners.forEach((l) => l());
}

const router = { replace: (href: string) => setUrl(href.split('?')[1] ?? ''), push: jest.fn() };

export const navigationMock = {
    useRouter: () => router,
    usePathname: () => '/dashboard/inventory',
    useSearchParams: () => {
        const current = React.useSyncExternalStore(
            (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
            () => search,
            () => search,
        );
        return new URLSearchParams(current);
    },
};
export const routerPush = router.push;
