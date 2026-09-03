import { useAuthStore } from '@/store/authStore';
import { StaffRole } from '@/types';

export type Permission =
    | 'view_outlet'
    | 'manage_staff'
    | 'create_bills'
    | 'create_purchases'
    | 'view_reports'
    | 'export_reports'
    | 'manage_settings'
    | 'override_credit'
    | 'view_purchase_rates'
    | 'view_all_outlets'
    | 'manage_outlets'
    | 'manage_products';

const ROLE_PERMISSIONS: Record<StaffRole, Permission[] | ['*']> = {
    owner: ['*'],
    super_admin: ['*'],
    admin: [
        'view_outlet', 'manage_staff', 'create_bills',
        'create_purchases', 'view_reports', 'export_reports',
        'manage_settings', 'override_credit', 'view_purchase_rates',
        'manage_outlets', 'manage_products'
    ],
    manager: [
        'view_outlet', 'create_bills', 'create_purchases',
        'view_reports', 'export_reports', 'override_credit', 'manage_products'
    ],
    billing_staff: [
        'view_outlet', 'create_bills'
    ],
    view_only: [
        'view_outlet', 'view_reports'
    ],
};

export function usePermissions() {
    const { user } = useAuthStore();

    const PERMISSION_MAP: Record<string, string> = {
        'view_sales': 'canEditSales',
        'create_bills': 'canEditSales',
        'view_purchases': 'canCreatePurchases',
        'create_purchases': 'canCreatePurchases',
        'view_gst': 'canExportGst',
        'export_reports': 'canExportGst',
        'view_reports': 'canAccessReports',
        'view_purchase_rates': 'canViewPurchaseRates',
        'override_credit': 'canEditRate',
    };

    const hasPermission = (permission: Permission | string): boolean => {
        // 1. Failsafe: No user state
        if (!user) return false;

        // 2. Master Admin Bypass (Prevents lockouts)
        if (user.role === 'admin' || user.role === 'super_admin') return true;

        // 3. Direct DB Boolean Check (For 'custom' roles)
        // If the permission matches an exact boolean key on the user object, return it.
        const dbKey = PERMISSION_MAP[permission as string] || permission;
        if (dbKey in user && typeof (user as any)[dbKey] === 'boolean') {
            return (user as any)[dbKey] as boolean;
        }

        // 4. Dictionary Lookup
        const perms = ROLE_PERMISSIONS[user.role as StaffRole];

        // 5. CRITICAL FIX: The null/array check MUST happen before reading perms[0]
        if (!perms || !Array.isArray(perms) || perms.length === 0) {
            return false;
        }

        // 6. Wildcard & Inclusion Check
        if (perms[0] === '*') return true;
        
        return (perms as Permission[]).includes(permission as Permission);
    };

    const hasAnyPermission = (...permissions: Permission[]): boolean =>
        permissions.some(hasPermission);

    const hasAllPermissions = (...permissions: Permission[]): boolean =>
        permissions.every(hasPermission);

    return { hasPermission, hasAnyPermission, hasAllPermissions, role: user?.role };
}
