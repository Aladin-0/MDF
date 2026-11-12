'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/apiClient';
import { PERMISSIONS_STALE_EVENT, getSessionEpoch } from '@/lib/sessionEvents';
import { applyOutletContext } from '@/lib/outletContext';

const POLL_MS = 3 * 60 * 1000;      // refresh while the app stays open
const MIN_GAP_MS = 20 * 1000;       // never hammer /auth/me
export { PERMISSIONS_STALE_EVENT };

/**
 * Keeps the stored user (role, flags, permission list, outlet) in step with the server.
 *
 * The user object is cached in localStorage and was only ever refreshed when a dashboard page
 * mounted (never on the billing screen). So after an admin changed someone's role or switched a
 * flag off, that person's UI kept showing the old rights until they logged out: buttons that
 * then failed with 403, or rights that did not appear. Now it refreshes on load, when the tab
 * regains focus, every few minutes, and immediately after any API call answers 403.
 *
 * A 401 (deactivated account / expired session) is handled by the API client, which clears the
 * session and returns to the login page.
 */
export function SessionSync() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const hasHydrated = useAuthStore((s) => s._hasHydrated);
    const lastRun = useRef(0);
    const inFlight = useRef(false);

    const refresh = useCallback(async (force = false) => {
        const now = Date.now();
        if (inFlight.current || (!force && now - lastRun.current < MIN_GAP_MS)) return;
        inFlight.current = true;
        lastRun.current = now;
        const epochBefore = getSessionEpoch();
        try {
            const fresh = await authApi.me();
            if (!fresh?.id) return;
            // The outlet was switched while this request was in flight: its answer describes the
            // outlet we just left. Applying it would put the old outlet back into the stored user.
            if (getSessionEpoch() !== epochBefore) return;
            const { user, setUser, setOutlet } = useAuthStore.getState();
            if (JSON.stringify(user) !== JSON.stringify(fresh)) {
                const outletChanged = !!user?.outletId && !!fresh.outletId && user.outletId !== fresh.outletId;
                setUser(fresh);
                if (fresh.outlet) setOutlet(fresh.outlet);
                if (outletChanged) {
                    // The server's active outlet is no longer the one this tab was built for (the
                    // account switched outlet in another tab or on another device). Follow it, and
                    // reload so nothing on screen still shows the old outlet's data.
                    applyOutletContext(fresh.outletId);
                    window.location.reload();
                }
            }
        } catch {
            // offline or a transient error: keep what we have (a 401 is handled inside the API client)
        } finally {
            inFlight.current = false;
            // Whatever the outcome, we asked: stop holding back access decisions on the cached user.
            useAuthStore.getState().setPermissionsFresh(true);
        }
    }, []);

    useEffect(() => {
        if (!hasHydrated || !isAuthenticated) return;
        refresh(true);
        const timer = setInterval(() => refresh(), POLL_MS);
        const onFocus = () => refresh();
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        const onStale = () => refresh(true);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener(PERMISSIONS_STALE_EVENT, onStale);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener(PERMISSIONS_STALE_EVENT, onStale);
        };
    }, [hasHydrated, isAuthenticated, refresh]);

    return null;
}
