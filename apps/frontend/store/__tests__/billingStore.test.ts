import { useBillingStore } from '../billingStore';

jest.mock('uuid', () => ({ v4: () => 'uuid-1234' }));

describe('billingStore', () => {
    beforeEach(() => {
        useBillingStore.getState().resetBilling();
    });

    it('binds invoiceDate correctly via updateDraftHeader', () => {
        const store = useBillingStore.getState();
        const draftId = store.createDraft();
        
        expect(useBillingStore.getState().drafts[draftId].invoiceDate).toBeUndefined();
        
        const testDate = '2026-07-18T16:36';
        useBillingStore.getState().updateDraftHeader(draftId, { invoiceDate: testDate });
        
        expect(useBillingStore.getState().drafts[draftId].invoiceDate).toBe(testDate);
    });

    it('sets documentMode correctly', () => {
        const store = useBillingStore.getState();
        const draftId = store.createDraft();
        
        expect(useBillingStore.getState().drafts[draftId].documentMode).toBe('invoice');
        
        useBillingStore.getState().setDraftDocumentMode(draftId, 'quotation');
        
        expect(useBillingStore.getState().drafts[draftId].documentMode).toBe('quotation');
    });
});
