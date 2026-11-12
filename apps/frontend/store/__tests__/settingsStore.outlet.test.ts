import { useSettingsStore, rehydrateSettingsForOutlet } from '../settingsStore';

const bucket = (id: string) => `mediflow-settings-${id}`;
const saved = (id: string) => JSON.parse(localStorage.getItem(bucket(id)) || 'null');

/** What the store would have written for an outlet, the way an earlier build wrote it. */
const legacyBucket = (id: string, state: Record<string, unknown>) =>
    localStorage.setItem(bucket(id), JSON.stringify({ state, version: 3 }));

describe('settingsStore: per-outlet buckets (chain dashboard outlet switching)', () => {
    beforeEach(() => {
        // every test starts on a throw-away bucket so writes made while resetting cannot leak into it
        useSettingsStore.persist.setOptions({ name: 'mediflow-settings-scratch' });
        useSettingsStore.setState({ selectedOutletId: null });
        useSettingsStore.getState().resetToDefaults();
        localStorage.clear();
    });

    it('never saves the active outlet id into the per-outlet bucket', () => {
        rehydrateSettingsForOutlet('A');
        useSettingsStore.getState().setOutletId('B');
        useSettingsStore.getState().updateOutletSettings({ outletName: 'Alpha' });

        expect(saved('A').state.outletName).toBe('Alpha');
        // Saving it was the bug: switching A -> B wrote "B" into A's bucket, and coming back to A loaded it.
        expect(saved('A').state).not.toHaveProperty('selectedOutletId');
    });

    it('ignores a selectedOutletId that an older build left inside a bucket', () => {
        legacyBucket('A', { selectedOutletId: 'B', outletName: 'Alpha' });
        useSettingsStore.setState({ selectedOutletId: 'A' });

        rehydrateSettingsForOutlet('A');

        // other settings load, but the stale "B" must not replace the active outlet
        expect(useSettingsStore.getState().outletName).toBe('Alpha');
        expect(useSettingsStore.getState().selectedOutletId).toBe('A');

        useSettingsStore.persist.rehydrate(); // a plain rehydrate cannot bring it back either
        expect(useSettingsStore.getState().selectedOutletId).toBe('A');
    });

    it('A -> B -> A keeps A as the active outlet and each outlet keeps its own settings', () => {
        rehydrateSettingsForOutlet('A');
        useSettingsStore.getState().setOutletId('A');
        useSettingsStore.getState().updateOutletSettings({ outletName: 'Alpha' });

        rehydrateSettingsForOutlet('B');
        useSettingsStore.getState().setOutletId('B');
        useSettingsStore.getState().updateOutletSettings({ outletName: 'Beta' });

        rehydrateSettingsForOutlet('A');
        useSettingsStore.getState().setOutletId('A');

        expect(useSettingsStore.getState().selectedOutletId).toBe('A');
        expect(useSettingsStore.getState().outletName).toBe('Alpha');
    });

    it("an outlet visited for the first time does not inherit the previous outlet's settings", () => {
        rehydrateSettingsForOutlet('A');
        useSettingsStore.getState().updateOutletSettings({ outletName: 'Alpha', outletCity: 'Pune' });

        rehydrateSettingsForOutlet('B'); // nothing saved for B yet

        expect(useSettingsStore.getState().outletName).toBe('');
        expect(useSettingsStore.getState().outletCity).toBe('');
        // ...and A's saved settings were not touched
        expect(saved('A').state.outletName).toBe('Alpha');
    });

    it('restores what was saved for an outlet that has a bucket', () => {
        legacyBucket('B', { outletName: 'Beta', outletCity: 'Nagpur' });
        rehydrateSettingsForOutlet('B');
        expect(useSettingsStore.getState().outletName).toBe('Beta');
        expect(useSettingsStore.getState().outletCity).toBe('Nagpur');
    });
});
