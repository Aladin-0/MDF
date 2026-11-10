import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthUser, Outlet } from '../types';

interface AuthState {
    user: AuthUser | null;
    outlet: Outlet | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    setUser: (user: AuthUser) => void;
    setOutlet: (outlet: Outlet) => void;
    setLoading: (v: boolean) => void;
    setError: (msg: string | null) => void;
    logout: () => void;
    _hasHydrated: boolean;
    setHasHydrated: (state: boolean) => void;
    /**
     * False on every page load (never persisted); becomes true once <SessionSync/> has had its first
     * answer from the server. Until then a cached user may be out of date, so access decisions that
     * would DENY must wait instead of bouncing someone who was granted access since they last logged in.
     */
    permissionsFresh: boolean;
    setPermissionsFresh: (fresh: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            outlet: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            setUser: (user) => set({ user, isAuthenticated: true }),
            setOutlet: (outlet) => set({ outlet }),
            setLoading: (isLoading) => set({ isLoading }),
            setError: (error) => set({ error }),
            logout: () => set({
                user: null,
                outlet: null,
                isAuthenticated: false,
                error: null,
                permissionsFresh: false,
            }),
            permissionsFresh: false,
            setPermissionsFresh: (permissionsFresh) => set({ permissionsFresh }),
            _hasHydrated: false,
            setHasHydrated: (state) => set({ _hasHydrated: state })
        }),
        {
            name: 'mediflow-auth',
            skipHydration: true,
            partialize: (state) => ({
                user: state.user,
                outlet: state.outlet,
                isAuthenticated: state.isAuthenticated
            }), // Only persist these fields
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.warn('Auth hydration error:', error);
                    useAuthStore.getState().setHasHydrated(true);
                } else {
                    useAuthStore.getState().setHasHydrated(true);
                }
            }
        }
    )
);
