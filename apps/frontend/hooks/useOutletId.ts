import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

export function useOutletId(): string {
    const { user, outlet } = useAuthStore();
    const { selectedOutletId } = useSettingsStore();

    // Staff/admins who are NOT super_admin can ONLY ever access their own assigned outlet.
    // If a stale selectedOutletId is lingering in localStorage from another session, ignore it!
    if (user && user.role !== 'super_admin') {
        return user.outletId || outlet?.id || '';
    }

    // Super admins can switch outlets across the chain; fallback to user's assigned outlet
    return selectedOutletId || user?.outletId || outlet?.id || '';
}
