import "@testing-library/jest-dom";
import React from 'react';
import { render } from '@testing-library/react';
import { BillSuccessScreen } from './BillSuccessScreen';

describe('BillSuccessScreen', () => {
    it('renders without crashing when createdAt is null', () => {
        const mockInvoice = {
            id: '1',
            grandTotal: 100,
            paymentMode: 'cash',
            createdAt: null,
        };
        const { getByText } = render(<BillSuccessScreen invoice={mockInvoice as any} onNewBill={() => {}} onPrint={() => {}} onViewInvoice={() => {}} />);
        expect(getByText('—')).toBeInTheDocument();
    });

    it('renders without crashing when createdAt is malformed', () => {
        const mockInvoice = {
            id: '1',
            grandTotal: 100,
            paymentMode: 'cash',
            createdAt: 'invalid-date-string',
        };
        const { getByText } = render(<BillSuccessScreen invoice={mockInvoice as any} onNewBill={() => {}} onPrint={() => {}} onViewInvoice={() => {}} />);
        expect(getByText('—')).toBeInTheDocument();
    });
});
