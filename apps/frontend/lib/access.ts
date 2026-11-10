/**
 * Access control for the UI. Pure functions, no React.
 *
 * SOURCE OF TRUTH = THE SERVER. The backend computes `user.permissions` with the same role sets
 * and flags its API enforces (apps/core/permissions.py `effective_permissions`) and sends it with
 * login / me / switch-outlet. `hasPermission` just checks membership in that list.
 *
 * Why: the UI used to re-implement the rules by hand and had drifted: it mapped `create_bills` to
 * the `canEditSales` flag, invented roles ('owner', 'cashier') the backend does not have, and the
 * API client dropped most flags, so permitted users never saw buttons and others saw buttons the
 * API refused.
 *
 * `fallbackPermissions` mirrors the server rules for ONE case: a session cached in localStorage
 * before the server sent `permissions`. It is verified against the server by
 * lib/permission-matrix.fixture.json (generated from the backend; a backend test fails if the
 * fixture is stale and tests/unit/access.test.ts fails if this code disagrees with it).
 */
import type { AuthUser, StaffRole } from '@/types';

export type Permission =
    | 'view_outlet'
    | 'create_bills'
    | 'create_purchases'
    | 'view_purchases'
    | 'edit_purchases'
    | 'edit_sales'
    | 'view_purchase_rates'
    | 'view_reports'
    | 'export_reports'
    | 'view_audit_history'
    | 'manage_partners'
    | 'edit_vouchers'
    | 'view_accounts'
    | 'override_credit'
    | 'manage_products'
    | 'manage_staff'
    | 'manage_settings'
    | 'send_purchase_orders'
    | 'cancel_purchase_orders'
    | 'manage_po_settings'
    | 'view_all_outlets'
    | 'manage_outlets';

export const ROLES: readonly StaffRole[] = ['super_admin', 'admin', 'manager', 'billing_staff', 'view_only'];

const ADMIN_ROLES: readonly string[] = ['super_admin', 'admin'];
const MANAGER_ROLES: readonly string[] = ['super_admin', 'admin', 'manager'];
const BILLING_ROLES: readonly string[] = ['super_admin', 'admin', 'manager', 'billing_staff'];

/**
 * 'cashier' and 'custom' are legacy role strings still found on old rows ('custom' was written by a bug
 * in the staff form). The backend treats them as billing_staff
 * (apps/core/permissions.py ROLE_ALIASES) and so do we; it can no longer be assigned.
 */
const ROLE_ALIASES: Record<string, StaffRole> = { cashier: 'billing_staff', custom: 'billing_staff' };

export function canonicalRole(role: unknown): StaffRole | null {
    if (typeof role !== 'string') return null;
    const aliased = ROLE_ALIASES[role] ?? role;
    return (ROLES as readonly string[]).includes(aliased) ? (aliased as StaffRole) : null;
}

export function isKnownRole(role: unknown): role is StaffRole {
    return canonicalRole(role) !== null;
}

type UserLike = Pick<AuthUser, 'role'> & Partial<AuthUser>;

/** Mirror of backend effective_permissions() — see file header. */
export function fallbackPermissions(user: UserLike | null | undefined): Permission[] {
    const role = canonicalRole(user?.role);
    if (!user || !role) return []; // unknown role: grant nothing
    const admin = ADMIN_ROLES.includes(role);
    const manager = MANAGER_ROLES.includes(role);
    const flag = (value: boolean | undefined) => admin || !!value;

    const out = new Set<Permission>(['view_outlet']);
    if (BILLING_ROLES.includes(role)) out.add('create_bills');
    if (flag(user.canCreatePurchases)) out.add('create_purchases');
    if (manager || user.canCreatePurchases || user.canEditPurchases || user.canViewPurchaseRates) out.add('view_purchases');
    if (flag(user.canEditPurchases)) {
        out.add('edit_purchases');
        out.add('cancel_purchase_orders');
    }
    if (flag(user.canCreatePurchases)) out.add('send_purchase_orders');
    if (flag(user.canEditSales)) out.add('edit_sales');
    if (flag(user.canViewPurchaseRates)) out.add('view_purchase_rates');
    if (flag(user.canAccessReports)) out.add('view_reports');
    if (flag(user.canExportGst)) out.add('export_reports');
    if (flag(user.canViewAuditHistory)) out.add('view_audit_history');
    if (flag(user.canManagePartners)) out.add('manage_partners');
    if (flag(user.canEditVouchers)) out.add('edit_vouchers');
    if (manager) {
        out.add('view_accounts');
        out.add('override_credit');
    }
    if (manager || flag(user.canCreatePurchases) || flag(user.canEditPurchases)) out.add('manage_products');
    if (admin) {
        out.add('manage_staff');
        out.add('manage_settings');
        out.add('manage_po_settings');
    }
    if (role === 'super_admin') {
        out.add('view_all_outlets');
        out.add('manage_outlets');
    }
    return Array.from(out).sort();
}

/** The user's permission list: the server's when present, otherwise the local mirror. */
export function permissionsOf(user: UserLike | null | undefined): readonly string[] {
    if (!user) return [];
    if (Array.isArray(user.permissions)) return user.permissions;
    return fallbackPermissions(user);
}

export function hasPermission(user: UserLike | null | undefined, permission: Permission | string): boolean {
    return permissionsOf(user).includes(permission);
}

export function hasAnyPermission(user: UserLike | null | undefined, ...permissions: (Permission | string)[]): boolean {
    return permissions.some((p) => hasPermission(user, p));
}

export function hasAllPermissions(user: UserLike | null | undefined, ...permissions: (Permission | string)[]): boolean {
    return permissions.every((p) => hasPermission(user, p));
}

/**
 * Cost / margin figures are only for the people who may see purchase economics. An allow-list,
 * so an unknown role is hidden by default (the old code hid margins only for the roles
 * 'cashier' and 'billing_staff' and so showed them to anything it did not recognise).
 */
export function canViewBillingMargins(role: string | null | undefined): boolean {
    return role === 'super_admin' || role === 'admin' || role === 'manager';
}
