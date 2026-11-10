/**
 * Which permission a page needs. One table, used by <RouteGuard> in every layout, so that typing a
 * URL (or following an old link) never opens a page the user cannot use. The API stays the real
 * authority; this only stops the UI showing empty/erroring pages and says why.
 *
 * Rules match by path prefix; the LONGEST matching prefix wins, so a more specific rule can relax
 * a broader one (sale returns live under /dashboard/accounts but are a billing feature).
 * Paths with no rule (dashboard, inventory, customers, credit, attendance, settings, ...) are
 * open to every signed-in user; pages with finer rules (settings) handle them themselves.
 */
import { hasPermission, type Permission } from '@/lib/access';
import type { AuthUser } from '@/types';

export interface RouteRule {
    prefix: string;
    permission: Permission;
}

export const ROUTE_RULES: readonly RouteRule[] = [
    { prefix: '/billing', permission: 'create_bills' },
    { prefix: '/dashboard/sales', permission: 'create_bills' },
    { prefix: '/dashboard/accounts/sale-returns', permission: 'create_bills' },
    { prefix: '/dashboard/accounts/purchase-returns', permission: 'view_purchases' },
    { prefix: '/dashboard/accounts', permission: 'view_accounts' },
    { prefix: '/dashboard/purchases', permission: 'view_purchases' },
    { prefix: '/dashboard/reports', permission: 'view_reports' },
    { prefix: '/gst', permission: 'view_reports' },
    { prefix: '/dashboard/staff', permission: 'manage_staff' },
    { prefix: '/dashboard/chain', permission: 'view_all_outlets' },
    { prefix: '/admin', permission: 'manage_staff' },
];

function matches(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function requiredPermissionFor(pathname: string): Permission | null {
    let best: RouteRule | null = null;
    for (const rule of ROUTE_RULES) {
        if (matches(pathname, rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) best = rule;
    }
    return best ? best.permission : null;
}

export function canAccessPath(user: Pick<AuthUser, 'role'> & Partial<AuthUser>, pathname: string): boolean {
    const needed = requiredPermissionFor(pathname);
    return needed === null || hasPermission(user, needed);
}
