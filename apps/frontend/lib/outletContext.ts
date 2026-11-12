import { authApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore, rehydrateSettingsForOutlet } from '@/store/settingsStore';
import { useBillingStore } from '@/store/billingStore';
import { bumpSessionEpoch } from '@/lib/sessionEvents';

/**
 * The one place that knows what "the active outlet changed" means for client state.
 *
 * The server decides which outlet a super admin is working in (`switch-outlet` saves it on the
 * staff record, and login / `/auth/me` report it). Everything on the client that is keyed by outlet
 * has to follow that, in this order:
 *   1. open the new outlet's settings bucket (BEFORE anything is written, or it lands in the old one)
 *   2. remember the active outlet id for this tab (`useOutletId()` reads it)
 *   3. drop the open bill / cart so it cannot be saved into the wrong outlet
 *
 * It used to be hand-copied in the header (full reload) and the chain dashboard (soft navigation),
 * in a different order each time, and each missed something.
 */
export function applyOutletContext(outletId: string): void {
    rehydrateSettingsForOutlet(outletId);
    useSettingsStore.getState().setOutletId(outletId);
    useBillingStore.getState().resetBilling();
}

/**
 * Switch the signed-in super admin into another outlet of their organization.
 *
 * Resolves once the server has accepted it and client state matches. Callers then do a full page
 * load (`window.location.assign / reload`): React Query cache, in-flight requests and the other
 * in-memory stores all still describe the old outlet, and a reload is the only way to be sure none
 * of it survives. Rejects with the API error (`{ detail }`) when the server refuses.
 */
export async function switchOutlet(outletId: string) {
    const data = await authApi.switchOutlet(outletId);

    bumpSessionEpoch(); // an older /auth/me still in flight must not overwrite what we set next
    useAuthStore.setState({ user: data.user, isAuthenticated: true });
    if (data.user.outlet) useAuthStore.getState().setOutlet(data.user.outlet);
    applyOutletContext(data.user.outletId);

    // Same attributes as the login cookie, so the session does not silently become a browser-session cookie.
    document.cookie = `access_token=${data.access}; path=/; max-age=86400; SameSite=Lax`;
    return data.user;
}
