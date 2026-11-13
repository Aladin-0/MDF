import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import FullScreenBillingPage from '../app/billing/page';
import { useBillingStore } from '../store/billingStore';
import { useIsPhone } from '../hooks/useIsPhone';

jest.mock('../hooks/useIsPhone', () => ({ useIsPhone: jest.fn() }));
jest.mock('../hooks/useAutosaveDraft', () => ({ useAutosaveDraft: () => undefined }));
jest.mock('../hooks/useLoadDrafts', () => ({ useLoadDrafts: () => true }));
jest.mock('../hooks/useEnterNavigation', () => ({ useEnterNavigation: () => undefined }));
jest.mock('../components/billing/StaffPinEntry', () => ({ StaffPinEntry: () => <div data-testid="pin" /> }));
jest.mock('../components/billing/BillSuccessScreen', () => ({ BillSuccessScreen: () => <div data-testid="desktop-success" /> }));
jest.mock('../components/billing/mobile/SuccessView', () => ({ SuccessView: () => <div data-testid="phone-success" /> }));
jest.mock('../components/billing/mobile/MobileBilling', () => ({ MobileBilling: () => <div data-testid="phone-billing" /> }));
jest.mock('../components/billing/InvoicePreviewModal', () => ({ InvoicePreviewModal: () => null }));
jest.mock('../components/billing/EditSaleHydrator', () => ({ EditSaleHydrator: () => <div data-testid="edit-loader" /> }));
jest.mock('../components/billing/BillingHeaderStrip', () => ({ BillingHeaderStrip: () => null }));
jest.mock('../components/billing/MainInvoiceWorkspace', () => ({ MainInvoiceWorkspace: () => <div data-testid="desktop-billing" /> }));
jest.mock('../components/billing/RightBillingRail', () => ({ RightBillingRail: () => null }));
jest.mock('../components/billing/ActiveBillsTabs', () => ({ ActiveBillsTabs: () => null }));
jest.mock('../components/layout/GlobalNavigation', () => ({ GlobalNavigation: () => null }));

const lastBill: any = { id: 'inv-1', invoiceNo: 'INV-1', grandTotal: 100 };

function setup(url: string, phone: boolean) {
    window.history.pushState({}, '', url);
    (useIsPhone as jest.Mock).mockReturnValue(phone);
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState({ isPinVerified: true, _hasHydrated: true, activeDraftId: id, lastInvoice: lastBill } as any);
    render(<FullScreenBillingPage />);
}

describe('/billing?edit=<id> goes straight to the editor, not to the previous bill\'s "Bill saved" screen', () => {
    it.each([['phone', true, 'phone-success', 'phone-billing'], ['desktop', false, 'desktop-success', 'desktop-billing']])(
        '%s: with ?edit= the success screen is skipped and the edit loader is on the page', (_n, phone, success, workspace) => {
            setup('/billing?edit=abc', phone as boolean);
            expect(screen.queryByTestId(success as string)).not.toBeInTheDocument();
            expect(screen.getByTestId('edit-loader')).toBeInTheDocument();
            expect(screen.getByTestId(workspace as string)).toBeInTheDocument();
        });

    it.each([['phone', true, 'phone-success'], ['desktop', false, 'desktop-success']])(
        '%s: without ?edit= a just-saved bill still shows its success screen', (_n, phone, success) => {
            setup('/billing', phone as boolean);
            expect(screen.getByTestId(success as string)).toBeInTheDocument();
        });
});
