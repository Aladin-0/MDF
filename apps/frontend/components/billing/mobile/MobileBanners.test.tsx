import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MobileBanners } from './MobileBanners';
import { useBillingStore } from '@/store/billingStore';

function seed(updates: Record<string, unknown> = {}, cart: any[] = []) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates, cart } as any } }));
}

describe('MobileBanners', () => {
    it('shows nothing for an ordinary bill', () => {
        seed();
        const { container } = render(<MobileBanners />);
        expect(container).toBeEmptyDOMElement();
    });

    it('edit mode: amber "Editing <invoice no>" (new on phone)', () => {
        seed({ editingSaleId: 'sale-1', sourceInvoiceNo: 'INV-2026-001742' });
        render(<MobileBanners />);
        const banner = screen.getByTestId('banner-editing');
        expect(banner).toHaveTextContent('Editing INV-2026-001742');
        expect(banner).toHaveClass('bg-amber-100');
        expect(banner).toHaveAttribute('role', 'status');
    });

    it('edit mode without a stored invoice number still says the bill is being edited', () => {
        seed({ editingSaleId: 'sale-1' });
        render(<MobileBanners />);
        expect(screen.getByTestId('banner-editing')).toHaveTextContent('Editing a saved bill');
    });

    it('a bill pre-filled from a quotation gets the blue banner (invoice mode only)', () => {
        seed({ quotationId: 'q1', sourceQuotationNo: 'QT-0007', documentMode: 'invoice' });
        const { unmount } = render(<MobileBanners />);
        expect(screen.getByTestId('banner-quotation')).toHaveTextContent('Pre-filled from Quotation QT-0007');
        unmount();

        seed({ quotationId: 'q1', sourceQuotationNo: 'QT-0007', documentMode: 'quotation' });
        render(<MobileBanners />);
        expect(screen.queryByTestId('banner-quotation')).not.toBeInTheDocument();
    });

    it('a repeat bill gets the green banner with how many items need review', () => {
        seed(
            { sourceInvoiceId: 'inv-1', sourceInvoiceNo: 'INV-55', documentMode: 'invoice' },
            [
                { batchId: 'a', batchAvailabilityStatus: 'AVAILABLE' },
                { batchId: 'b', batchAvailabilityStatus: 'EXPIRED' },
                { batchId: 'c', batchAvailabilityStatus: 'OUT_OF_STOCK' },
            ],
        );
        render(<MobileBanners />);
        const banner = screen.getByTestId('banner-repeat');
        expect(banner).toHaveTextContent('Pre-filled from Invoice INV-55');
        expect(banner).toHaveTextContent('2 items need review');
        expect(banner).toHaveClass('bg-green-100');
    });

    it('a repeat bill with every item available has no review count', () => {
        seed({ sourceInvoiceId: 'inv-1', sourceInvoiceNo: 'INV-55' }, [{ batchId: 'a', batchAvailabilityStatus: 'AVAILABLE' }]);
        render(<MobileBanners />);
        expect(screen.getByTestId('banner-repeat')).not.toHaveTextContent('need review');
    });

    it('only one banner at a time: editing wins over a pre-filled source', () => {
        seed({ editingSaleId: 's1', quotationId: 'q1', sourceQuotationNo: 'QT-1', sourceInvoiceId: 'i1', sourceInvoiceNo: 'INV-1' });
        render(<MobileBanners />);
        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(screen.getByTestId('banner-editing')).toBeInTheDocument();
    });
});
