import { useBillingStore } from './billingStore';

describe('billingStore Payment State', () => {
    beforeEach(() => {
        useBillingStore.getState().resetBilling();
    });

    it('should set and persist UPI payment method correctly', () => {
        const store = useBillingStore.getState();
        const draftId = store.createDraft();
        store.switchDraft(draftId);

        store.setPayment({ method: 'upi' });

        const draft = useBillingStore.getState().drafts[draftId];
        expect(draft.payment.method).toBe('upi');
    });

    it('should set and persist Card payment method correctly', () => {
        const store = useBillingStore.getState();
        const draftId = store.createDraft();
        store.switchDraft(draftId);

        store.setPayment({ method: 'card' });

        const draft = useBillingStore.getState().drafts[draftId];
        expect(draft.payment.method).toBe('card');
    });

    it('should set and persist Cash payment method correctly with cashTendered', () => {
        const store = useBillingStore.getState();
        const draftId = store.createDraft();
        store.switchDraft(draftId);

        store.setPayment({ method: 'cash', cashTendered: 500 });

        const draft = useBillingStore.getState().drafts[draftId];
        expect(draft.payment.method).toBe('cash');
        expect(draft.payment.cashTendered).toBe(500);
    });
    
    it('should set and persist Credit payment method correctly', () => {
        const store = useBillingStore.getState();
        const draftId = store.createDraft();
        store.switchDraft(draftId);

        store.setPayment({ method: 'credit' });

        const draft = useBillingStore.getState().drafts[draftId];
        expect(draft.payment.method).toBe('credit');
    });
});
