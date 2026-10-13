import "@testing-library/jest-dom";
import React from 'react';
import { render } from '@testing-library/react';
import { MainInvoiceWorkspace } from './MainInvoiceWorkspace';
import { useBillingStore } from '../../store/billingStore';

// Mock the store
jest.mock('../../store/billingStore', () => ({
    useBillingStore: jest.fn(),
}));

jest.mock('@/hooks/useProductSearch', () => ({
    useProductSearch: () => ({ data: [], isFetching: false }),
}));

describe('MainInvoiceWorkspace', () => {
    it('renders without crashing when cart item expiryDate is null', () => {
        (useBillingStore as unknown as jest.Mock).mockReturnValue({
            activeDraftId: 'draft-1',
            drafts: {
                'draft-1': {
                    cart: [{
                        batchId: '1',
                        name: 'Test Item',
                        expiryDate: null,
                        mrp: 100,
                        qtyStrips: 1,
                        qtyLoose: 0,
                        totalAmount: 100,
                    }],
                    documentMode: 'invoice',
                    saleType: 'RETAIL',
                }
            },
            patientInfo: null,
            doctorInfo: null,
            subtotal: 100,
            discount: 0,
            tax: 0,
            grandTotal: 100,
            setCart: jest.fn(),
        });
        
        // Mock getExpiryStatus to avoid internal crashes if any
        jest.mock('../../utils/expiry', () => ({
            getExpiryStatus: () => 'good',
        }), { virtual: true });

        // Since it's a mock, it should render without crashing
        const { getByText } = render(<MainInvoiceWorkspace />);
        expect(getByText('—')).toBeInTheDocument();
    });

    it('renders without crashing when cart item expiryDate is malformed', () => {
        (useBillingStore as unknown as jest.Mock).mockReturnValue({
            activeDraftId: 'draft-1',
            drafts: {
                'draft-1': {
                    cart: [{
                        batchId: '2',
                        name: 'Test Item 2',
                        expiryDate: 'invalid-date',
                        mrp: 100,
                        qtyStrips: 1,
                        qtyLoose: 0,
                        totalAmount: 100,
                    }],
                    documentMode: 'invoice',
                    saleType: 'RETAIL',
                }
            },
            patientInfo: null,
            doctorInfo: null,
            subtotal: 100,
            discount: 0,
            tax: 0,
            grandTotal: 100,
            setCart: jest.fn(),
        });

        const { getByText } = render(<MainInvoiceWorkspace />);
        expect(getByText('invalid-date')).toBeInTheDocument();
    });
});
