import type { AuthUser } from '@/types';

/**
 * Turns the user object the backend sends (login, /auth/me, switch-outlet: all built by
 * `build_user_payload`) into the AuthUser stored in the app.
 *
 * It used to be three hand-written copies in apiClient.ts that each copied only ~8 fields, so
 * about 25 of the ~30 permission flags (canEditSales, canEditPurchases, canModifyPaidBill,
 * canManagePartners, ...) and the server's `permissions` list were silently thrown away: people
 * who had been granted a right never saw its buttons. This keeps everything the server sends.
 */
export function mapAuthUser(raw: any): AuthUser {
    const outlet = raw?.outlet ?? {};
    return {
        ...raw,
        organizationId: raw?.organizationId ?? undefined,
        isSuperAdmin: raw?.isSuperAdmin ?? false,
        outlet: {
            ...outlet,
            id: outlet.id ?? raw?.outletId,
        },
        permissions: Array.isArray(raw?.permissions) ? raw.permissions : undefined,
    } as AuthUser;
}
