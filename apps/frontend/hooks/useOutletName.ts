'use client';

import { useQuery } from '@tanstack/react-query';
import { chainApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useOutletId } from '@/hooks/useOutletId';

/** The name of the outlet the app is currently showing (a super admin may be looking at a branch other than their own). */
export function useOutletName(): string {
    const user = useAuthStore((s) => s.user);
    const outlet = useAuthStore((s) => s.outlet);
    const outletId = useOutletId();
    const ownId = user?.outletId || outlet?.id;
    const isOwn = !outletId || outletId === ownId;

    // the same query (and cache entry) the top bar's outlet selector uses
    const { data: outlets } = useQuery({
        queryKey: ['org-outlets', user?.organizationId],
        queryFn: async () => (user?.organizationId ? (await chainApi.getOrgOutlets(user.organizationId)) || [] : []),
        enabled: !isOwn && !!user?.isSuperAdmin && !!user?.organizationId,
        staleTime: 1000 * 60 * 10,
    });

    if (isOwn) return outlet?.name ?? user?.outlet?.name ?? '';
    return outlets?.find((o: { id: string; name: string }) => o.id === outletId)?.name ?? '';
}
