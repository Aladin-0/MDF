'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canAccessPath } from '@/lib/routeAccess';
import { toast } from '@/hooks/use-toast';

/**
 * Keeps people off pages their role/permissions do not allow (see lib/routeAccess.ts).
 * Renders nothing for a blocked page instead of flashing it, and sends the user to the dashboard.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const fresh = useAuthStore((s) => s.permissionsFresh);

    // No user yet: the layout's auth gate is still deciding (login redirect / skeleton). Do not block.
    const allowed = !user || canAccessPath(user, pathname);
    // The cached user may be stale right after a page load: before DENYING, wait for the first
    // answer from the server (SessionSync). Allowing is always immediate.
    const denied = !allowed && fresh;

    useEffect(() => {
        if (denied) {
            toast({ title: "You don't have access to that page", description: 'Ask an admin if you need it.', variant: 'destructive' });
            router.replace('/dashboard');
        }
    }, [denied, router]);

    return allowed ? <>{children}</> : null;
}
