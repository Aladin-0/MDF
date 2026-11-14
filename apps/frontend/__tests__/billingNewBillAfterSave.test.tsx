import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FullScreenBillingPage from '../app/billing/page';
import { useBillingStore } from '../store/billingStore';
import { useIsPhone } from '../hooks/useIsPhone';

jest.mock('../hooks/useIsPhone', () => ({ useIsPhone: jest.fn() }));
jest.mock('../hooks/useAutosaveDraft', () => ({ useAutosaveDraft: () => undefined }));
jest.mock('../hooks/useLoadDrafts', () => ({ useLoadDrafts: () => true }));
jest.mock('../hooks/useEnterNavigation', () => ({ useEnterNavigation: () => undefined }));
jest.mock('../components/billing/StaffPinEntry', () => ({ StaffPinEntry: () => <div data-testid="pin" /> }));
jest.mock('../components/billing/InvoicePreviewModal', () => ({ InvoicePreviewModal: () => null }));
jest.mock('../components/billing/EditSaleHydrator', () => ({ EditSaleHydrator: () => null }));
jest.mock('../components/billing/BillingHeaderStrip', () => ({ BillingHeaderStrip: () => null }));
jest.mock('../components/billing/RightBillingRail', () => ({ RightBillingRail: () => null }));
jest.mock('../components/billing/ActiveBillsTabs', () => ({ ActiveBillsTabs: () => null }));   // the desktop's own "make one if none" lives here: off, so the page is what is tested
jest.mock('../components/layout/GlobalNavigation', () => ({ GlobalNavigation: () => null }));
jest.mock('../components/billing/BillSuccessScreen', () => ({
    BillSuccessScreen: ({ onNewBill }: any) => <button onClick={onNewBill}>New bill</button>,
}));
jest.mock('../components/billing/mobile/SuccessView', () => ({
    SuccessView: ({ onNewBill }: any) => <button onClick={onNewBill}>New bill</button>,
}));
// Like the real screens, these draw nothing when there is no active bill (that is what the white screen was)
jest.mock('../components/billing/mobile/MobileBilling', () => ({
    MobileBilling: () => {
        const { activeDraftId, drafts } = useBillingStore();
        return activeDraftId && drafts[activeDraftId] ? <div data-testid="phone-billing" /> : null;
    },
}));
jest.mock('../components/billing/MainInvoiceWorkspace', () => ({ MainInvoiceWorkspace: () => <div data-testid="desktop-billing" /> }));

const lastBill: any = { id: 'inv-1', invoiceNo: 'INV-1', grandTotal: 100 };

/** What useSaveBill does when a bill is saved: show the success screen and close the draft it was made from. */
function saveTheOnlyBill() {
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState({ isPinVerified: true, _hasHydrated: true, lastInvoice: null } as any);
    act(() => {
        useBillingStore.getState().setLastInvoice(lastBill);
        useBillingStore.getState().closeDraft(id);
    });
}

beforeEach(() => {
    window.history.pushState({}, '', '/billing');
    useBillingStore.setState({ drafts: {}, activeDraftId: null, lastInvoice: null, isPinVerified: true, _hasHydrated: true } as any);
});

describe('New bill after saving a bill (the phone showed a white screen)', () => {
    it.each([['phone', true, 'phone-billing'], ['desktop', false, 'desktop-billing']])(
        '%s: saving the only bill, then New bill, leaves a bill on screen', (_n, phone, workspace) => {
            (useIsPhone as jest.Mock).mockReturnValue(phone);
            saveTheOnlyBill();
            expect(Object.keys(useBillingStore.getState().drafts)).toHaveLength(0);     // the state that used to blank the page
            render(<FullScreenBillingPage />);
            fireEvent.click(screen.getByRole('button', { name: 'New bill' }));
            expect(screen.getByTestId(workspace as string)).toBeInTheDocument();
            expect(Object.keys(useBillingStore.getState().drafts)).toHaveLength(1);
        });

    it('a fresh bill is a clean one: empty cart, no leftover from the saved bill', () => {
        (useIsPhone as jest.Mock).mockReturnValue(true);
        saveTheOnlyBill();
        render(<FullScreenBillingPage />);
        fireEvent.click(screen.getByRole('button', { name: 'New bill' }));
        const s = useBillingStore.getState();
        expect(s.drafts[s.activeDraftId as string].cart).toHaveLength(0);
        expect(s.lastInvoice).toBeNull();
    });

    it('does not add a bill when one is already open', () => {
        (useIsPhone as jest.Mock).mockReturnValue(true);
        const id = useBillingStore.getState().createDraft();
        render(<FullScreenBillingPage />);
        expect(screen.getByTestId('phone-billing')).toBeInTheDocument();
        expect(Object.keys(useBillingStore.getState().drafts)).toEqual([id]);
    });

    it('if the active bill is gone but others remain, it switches to one of them (and makes no new one)', () => {
        (useIsPhone as jest.Mock).mockReturnValue(true);
        const a = useBillingStore.getState().createDraft();
        useBillingStore.setState({ activeDraftId: 'local-gone' } as any);
        render(<FullScreenBillingPage />);
        expect(useBillingStore.getState().activeDraftId).toBe(a);
        expect(Object.keys(useBillingStore.getState().drafts)).toEqual([a]);
        expect(screen.getByTestId('phone-billing')).toBeInTheDocument();
    });
});
