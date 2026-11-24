import React, { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { useBillingStore } from '@/store/billingStore';
import { TransactionStrip } from '@/components/billing/TransactionStrip';
import { useLoadDrafts } from '@/hooks/useLoadDrafts';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/lib/apiClient', () => ({ draftsApi: { list: jest.fn().mockResolvedValue([]) }, billingApi: {}, API_URL: '', getHeaders: () => ({}) }));

/**
 * Billing components pick only the store values they use (useShallow selectors). They used to subscribe to the
 * WHOLE store, so any change anywhere (the last invoice, the search text, another draft's autosave status)
 * re-rendered every billing component.
 */
describe('billing components re-render only for what they show', () => {
    beforeEach(() => {
        act(() => {
            useBillingStore.getState().resetBilling();
            useBillingStore.getState().createDraft();
        });
    });

    it('TransactionStrip: not for unrelated store changes, yes for its own bill', () => {
        let renders = 0;
        render(<Profiler id="strip" onRender={() => { renders += 1; }}><TransactionStrip /></Profiler>);
        const after = renders;
        act(() => { useBillingStore.getState().setLastInvoice({ id: 'x' } as any); });
        act(() => { useBillingStore.getState().setSearchQuery('dolo'); });
        act(() => { useBillingStore.getState().setCustomerSelectorOpen(true); });
        expect(renders).toBe(after);
        const id = useBillingStore.getState().activeDraftId!;
        act(() => { useBillingStore.getState().setDraftDocumentMode(id, 'quotation'); });
        expect(renders).toBe(after + 1);
    });

    it('a component that only uses actions (draft loading) never re-renders from the store', () => {
        let renders = 0;
        function Loader() { renders += 1; useLoadDrafts(); return null; }
        render(<Loader />);
        const after = renders;
        const id = useBillingStore.getState().activeDraftId!;
        act(() => { useBillingStore.getState().setDraftDocumentMode(id, 'quotation'); });
        act(() => { useBillingStore.getState().setSearchQuery('x'); });
        act(() => { useBillingStore.getState().setWalkInName('Ramesh'); });
        expect(renders).toBe(after);
    });
});
