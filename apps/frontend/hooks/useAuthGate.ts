import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

/**
 * The login redirect every protected layout needs, in one place. (Four layouts each carried their
 * own copy of this plus a user refresh that used a different response shape in each.)
 * Keeping the user fresh is now <SessionSync/>'s job, mounted once for the whole app.
 *
 * Returns true once the session has been restored and the user is signed in.
 */
export function useAuthGate(): boolean {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const hasHydrated = useAuthStore((s) => s._hasHydrated);
    const router = useRouter();

    useEffect(() => {
        if (hasHydrated && !isAuthenticated) router.push('/login');
    }, [hasHydrated, isAuthenticated, router]);

    return hasHydrated && isAuthenticated;
}
