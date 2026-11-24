import React from 'react';
import { act, render } from '@testing-library/react';
import { useOutletId } from '@/hooks/useOutletId';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

let renders = 0;
let seen = '';
function Probe() {
    renders += 1;
    seen = useOutletId();
    return null;
}

const user = (role: string, outletId = 'own') => ({ id: 'u1', role, outletId, name: 'X' }) as any;

beforeEach(() => {
    renders = 0;
    act(() => {
        useAuthStore.setState({ user: null, outlet: null as any, permissionsFresh: false });
        useSettingsStore.setState({ selectedOutletId: null });
    });
});

describe('useOutletId: same answers as before', () => {
    it('staff always get their own outlet, even with a stale selection left in storage', () => {
        act(() => {
            useAuthStore.setState({ user: user('manager', 'own') });
            useSettingsStore.setState({ selectedOutletId: 'someone-elses' });
        });
        render(<Probe />);
        expect(seen).toBe('own');
    });

    it('staff without an outlet on the user fall back to the stored outlet record', () => {
        act(() => useAuthStore.setState({ user: user('billing_staff', ''), outlet: { id: 'record' } as any }));
        render(<Probe />);
        expect(seen).toBe('record');
    });

    it('a super admin uses the outlet they switched to, else their own', () => {
        act(() => useAuthStore.setState({ user: user('super_admin', 'own') }));
        render(<Probe />);
        expect(seen).toBe('own');
        act(() => useSettingsStore.setState({ selectedOutletId: 'branch-2' }));
        expect(seen).toBe('branch-2');
    });

    it('nobody signed in: the selection, else empty', () => {
        render(<Probe />);
        expect(seen).toBe('');
    });
});

describe('useOutletId: re-renders only when the outlet can change', () => {
    it('ignores unrelated store changes (the session check used to re-render ~70 components)', () => {
        act(() => useAuthStore.setState({ user: user('manager', 'own') }));
        render(<Probe />);
        const before = renders;
        act(() => useAuthStore.getState().setPermissionsFresh(true));      // the session check finishing
        act(() => useAuthStore.setState({ user: { ...user('manager', 'own'), name: 'Renamed' } }));   // same outlet, new object
        act(() => useSettingsStore.setState({ selectedOutletId: 'ignored-for-staff' } as any));
        expect(renders).toBe(before);
        act(() => useAuthStore.setState({ user: user('manager', 'moved') }));
        expect(seen).toBe('moved');
        expect(renders).toBe(before + 1);
    });
});
