import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
    _hasHydrated: boolean;
    setHasHydrated: (v: boolean) => void;
    user: any;
}

const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            _hasHydrated: false,
            setHasHydrated: (v) => set({ _hasHydrated: v }),
            user: null,
        }),
        {
            name: 'test-auth',
            skipHydration: true,
            partialize: (state) => ({ user: state.user }),
            onRehydrateStorage: () => (state, error) => {
                console.log("State passed to callback:", Object.keys(state || {}));
                if (state?.setHasHydrated) {
                    state.setHasHydrated(true);
                    console.log("Called setHasHydrated");
                } else {
                    console.log("state.setHasHydrated IS MISSING!");
                }
            }
        }
    )
);

useAuthStore.persist.rehydrate();
console.log("Final hydrated:", useAuthStore.getState()._hasHydrated);
