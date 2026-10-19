import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { authApi, clearAuthToken } from './apiClient'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'

export async function handleLogout(_router?: AppRouterInstance) {
    try {
        await authApi.logout()
    } catch {
        // ignore — always proceed to logout client side
    } finally {
        // 1. Clear Zustand in-memory state
        useAuthStore.getState().logout()
        useSettingsStore.setState({ selectedOutletId: null })
        clearAuthToken()

        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('mediflow_mock_auth')

            // 2. Explicitly destroy ALL auth cookies
            document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
            document.cookie = 'refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
            document.cookie = 'mediflow_mock_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'

            // 3. Wipe the Zustand persisted auth from localStorage synchronously.
            //    Without this, the persist middleware may re-hydrate stale auth state
            //    on the next page load if the async persist write hasn't completed yet.
            localStorage.removeItem('mediflow-auth')

            // 4. Use replace() — causes a full page reload (kills all in-flight queries
            //    and React Query cache) and prevents the back button from returning
            //    to the authenticated dashboard after logout.
            window.location.replace('/login')
        }
    }
}
