import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * The outlet the current screen works on.
 *
 * Reads only the four values it needs. It used to subscribe to the WHOLE auth and settings stores, and ~70
 * components call it, so any change in either store (the session check every few minutes, a token refresh, a
 * settings toggle) re-rendered most of the app even though the outlet had not changed.
 */
export function useOutletId(): string {
    const hasUser = useAuthStore((s) => !!s.user);
    const role = useAuthStore((s) => s.user?.role);
    const userOutletId = useAuthStore((s) => s.user?.outletId);
    const outletRecordId = useAuthStore((s) => s.outlet?.id);
    // Staff/admins who are NOT super_admin can ONLY ever access their own assigned outlet.
    // If a stale selectedOutletId is lingering in localStorage from another session, ignore it!
    const ownOutletOnly = hasUser && role !== 'super_admin';
    // (and then don't even watch it: an outlet switch elsewhere must not re-render a staff member's screen)
    const selectedOutletId = useSettingsStore((s) => (ownOutletOnly ? null : s.selectedOutletId));

    if (ownOutletOnly) {
        return userOutletId || outletRecordId || '';
    }

    // Super admins can switch outlets across the chain; fallback to user's assigned outlet
    return selectedOutletId || userOutletId || outletRecordId || '';
}
