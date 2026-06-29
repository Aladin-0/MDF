'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore, rehydrateSettingsForOutlet } from '../store/settingsStore';

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        try {
            useAuthStore.persist.rehydrate();
        } catch (e) {
            console.error('Failed to rehydrate auth store:', e);
        } finally {
            useAuthStore.getState().setHasHydrated(true);
        }

        // Then re-key settings store to the current outlet's bucket and hydrate
        try {
            const auth = JSON.parse(localStorage.getItem('mediflow-auth') || '{}');
            const outletId = auth?.state?.user?.outletId;
            if (outletId) {
                rehydrateSettingsForOutlet(outletId);
            } else {
                useSettingsStore.persist.rehydrate();
                useSettingsStore.getState().setHasHydrated(true);
            }
        } catch {
            useSettingsStore.persist.rehydrate();
            useSettingsStore.getState().setHasHydrated(true);
        }
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
