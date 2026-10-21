'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore, rehydrateSettingsForOutlet } from '../store/settingsStore';
import { useBillingStore } from '../store/billingStore';

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        try {
            useAuthStore.persist.rehydrate();
        } catch (e) {
            console.error('Failed to rehydrate auth store:', e);
        } finally {
            useAuthStore.getState().setHasHydrated(true);
        }

        try {
            useBillingStore.persist.rehydrate();
        } catch (e) {
            console.error('Failed to rehydrate billing store:', e);
        } finally {
            useBillingStore.getState().setHasHydrated(true);
        }

        // Then re-key settings store to the current outlet's bucket and hydrate
        try {
            const auth = JSON.parse(localStorage.getItem('mediflow-auth') || '{}');
            const user = auth?.state?.user;
            const outletId = user?.outletId;
            if (outletId) {
                rehydrateSettingsForOutlet(outletId);
                if (user?.role !== 'super_admin') {
                    useSettingsStore.getState().setOutletId(outletId);
                }
            } else {
                useSettingsStore.persist.rehydrate();
                useSettingsStore.getState().setHasHydrated(true);
            }
        } catch {
            useSettingsStore.persist.rehydrate();
            useSettingsStore.getState().setHasHydrated(true);
        }

        // Proactive Service Worker cleanup to eliminate stale PWA/Workbox caching
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const registration of registrations) {
                    registration.unregister().catch(() => {});
                }
            }).catch(() => {});
            if ('caches' in window) {
                caches.keys().then((keys) => {
                    for (const key of keys) {
                        caches.delete(key).catch(() => {});
                    }
                }).catch(() => {});
            }
        }
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
