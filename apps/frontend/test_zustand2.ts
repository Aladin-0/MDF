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
            onRehydrateStorage: () => (state, error) => {
                console.log("error:", error);
                if (state) {
                    state.setHasHydrated(true);
                    console.log("Called setHasHydrated");
                } else {
                    console.log("state IS UNDEFINED OR NULL!");
                }
            }
        }
    )
);

// mock localStorage
(global as any).localStorage = {
    getItem: () => "null", // Corrupted state!
    setItem: () => {},
    removeItem: () => {}
};

useAuthStore.persist.rehydrate();
console.log("Final hydrated:", useAuthStore.getState()._hasHydrated);
