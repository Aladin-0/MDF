import { act } from '@testing-library/react';
import { useBillingStore } from '@/store/billingStore';
import { flushPendingStorageWrites } from '@/lib/debouncedStorage';

const KEY = 'mediflow-billing-drafts';

describe('billing store: saving open bills to the browser', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
    });
    afterEach(() => jest.useRealTimers());

    it('saves the same fields as before, once the typing settles (not on every key)', () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem');
        act(() => { useBillingStore.getState().createDraft(); });
        const id = useBillingStore.getState().activeDraftId!;
        setItem.mockClear();
        act(() => {
            for (const name of ['R', 'Ra', 'Ram', 'Rame', 'Rames', 'Ramesh']) {
                useBillingStore.getState().setWalkInName?.(name);
            }
        });
        expect(setItem.mock.calls.filter(([k]) => k === KEY)).toHaveLength(0);     // nothing written per key
        act(() => { jest.advanceTimersByTime(400); });
        const writes = setItem.mock.calls.filter(([k]) => k === KEY);
        expect(writes).toHaveLength(1);
        const saved = JSON.parse(writes[0][1] as string).state;
        expect(Object.keys(saved).sort()).toEqual(
            ['activeDraftId', 'activeStaff', 'billsToday', 'drafts', 'isPinVerified', 'landingCostIncludeGst', 'showMarginInfo'],
        );
        expect(saved.activeDraftId).toBe(id);
        setItem.mockRestore();
    });

    it('nothing is lost on leaving the page: the pending state is written at once', () => {
        act(() => { useBillingStore.getState().createDraft(); });
        const id = useBillingStore.getState().activeDraftId;
        act(() => { window.dispatchEvent(new Event('pagehide')); });
        expect(JSON.parse(localStorage.getItem(KEY)!).state.activeDraftId).toBe(id);
        flushPendingStorageWrites();
    });
});
