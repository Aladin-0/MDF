import { useAuthStore } from '@/store/authStore';
import {
    hasPermission as check,
    hasAnyPermission as checkAny,
    hasAllPermissions as checkAll,
    type Permission,
} from '@/lib/access';

export type { Permission };

/**
 * UI permission checks. The rules live in lib/access.ts and, above all, on the server:
 * `user.permissions` is computed by the backend with the same rules its API enforces.
 * (This hook used to hold a hand-written role table and a flag map of its own, which had drifted
 * from the API.)
 */
export function usePermissions() {
    const user = useAuthStore((s) => s.user);

    const hasPermission = (permission: Permission | string): boolean => check(user, permission);
    const hasAnyPermission = (...permissions: (Permission | string)[]): boolean => checkAny(user, ...permissions);
    const hasAllPermissions = (...permissions: (Permission | string)[]): boolean => checkAll(user, ...permissions);

    return { hasPermission, hasAnyPermission, hasAllPermissions, role: user?.role };
}
