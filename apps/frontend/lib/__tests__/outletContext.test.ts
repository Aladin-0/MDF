import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useBillingStore } from '@/store/billingStore';
import { switchOutlet, applyOutletContext } from '../outletContext';
import { getSessionEpoch } from '../sessionEvents';
import { authApi } from '@/lib/apiClient';

jest.mock('uuid', () => ({ v4: () => 'uuid-1234' }));
jest.mock('@/lib/apiClient', () => ({ authApi: { switchOutlet: jest.fn() } }));

const switchOutletApi = authApi.switchOutlet as jest.Mock;

const apiAnswer = (outletId: string) => ({
    access: 'new-jwt',
    refresh: 'new-refresh',
    user: { id: 'u1', role: 'super_admin', outletId, outlet: { id: outletId, name: `Outlet ${outletId}` } },
});

describe('outletContext', () => {
    beforeEach(() => {
        localStorage.clear();
        document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        jest.restoreAllMocks();
        switchOutletApi.mockReset();
        useSettingsStore.setState({ selectedOutletId: 'A' });
        useAuthStore.setState({ user: apiAnswer('A').user as any, isAuthenticated: true });
    });

    it('moves the user, the active outlet, the settings bucket and the cookie to the new outlet', async () => {
        switchOutletApi.mockResolvedValue(apiAnswer('B'));
        const epochBefore = getSessionEpoch();

        await switchOutlet('B');

        expect(switchOutletApi).toHaveBeenCalledWith('B');
        expect(useAuthStore.getState().user?.outletId).toBe('B');
        expect(useAuthStore.getState().outlet?.id).toBe('B');
        expect(useSettingsStore.getState().selectedOutletId).toBe('B');
        expect(useSettingsStore.persist.getOptions().name).toBe('mediflow-settings-B');
        expect(document.cookie).toContain('access_token=new-jwt');
        // an /auth/me still in flight for outlet A must be discarded by <SessionSync/>
        expect(getSessionEpoch()).toBe(epochBefore + 1);
    });

    it('clears the open bill so it cannot be saved into the other outlet', async () => {
        const draftId = useBillingStore.getState().createDraft();
        expect(Object.keys(useBillingStore.getState().drafts)).toContain(draftId);
        switchOutletApi.mockResolvedValue(apiAnswer('B'));

        await switchOutlet('B');

        expect(Object.keys(useBillingStore.getState().drafts)).not.toContain(draftId);
    });

    it('changes nothing when the server refuses the switch', async () => {
        switchOutletApi.mockRejectedValue({ detail: 'Requested outlet not found within your organization' });
        const epochBefore = getSessionEpoch();

        await expect(switchOutlet('Z')).rejects.toEqual({ detail: expect.any(String) });

        expect(useAuthStore.getState().user?.outletId).toBe('A');
        expect(useSettingsStore.getState().selectedOutletId).toBe('A');
        expect(getSessionEpoch()).toBe(epochBefore);
    });

    it('opens the new outlet bucket BEFORE recording the active outlet (it used to land in the old bucket)', () => {
        const order: string[] = [];
        jest.spyOn(useSettingsStore.persist, 'setOptions').mockImplementation(() => { order.push('bucket'); });
        const realSet = useSettingsStore.getState().setOutletId;
        useSettingsStore.setState({ setOutletId: (id: string) => { order.push('active'); realSet(id); } } as any);

        applyOutletContext('B');

        expect(order).toEqual(['bucket', 'active']);
    });
});
