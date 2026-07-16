import React from 'react';
import { render } from '@testing-library/react';
import { InvoiceThermal } from './InvoiceThermal';

describe('InvoiceThermal', () => {
    it('renders without crashing when createdAt is null', () => {
        const mockInvoice = {
            id: '1',
            items: [],
            grandTotal: 100,
            createdAt: null,
        };
        render(<InvoiceThermal invoice={mockInvoice as any} />);
    });

    it('renders without crashing when createdAt is malformed', () => {
        const mockInvoice = {
            id: '1',
            items: [],
            grandTotal: 100,
            createdAt: 'invalid-date-string',
        };
        render(<InvoiceThermal invoice={mockInvoice as any} />);
    });
});
