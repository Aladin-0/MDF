import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { ManavataA4Invoice } from './ManavataA4Invoice';

jest.mock('@/store/authStore', () => ({
    useAuthStore: () => ({ user: { name: 'Admin Staff' } }),
}));

jest.mock('@/hooks/useOutletId', () => ({
    useOutletId: () => 'test-outlet-id',
}));

describe('ManavataA4Invoice Print Batch Word Wrapping', () => {
    it('renders batch with break-words whitespace-normal max-w-[80px]', () => {
        const mockInvoice = {
            id: 'inv-1',
            invoiceNo: 'INV-1001',
            invoiceDate: '2026-10-10',
            saleType: 'RETAIL',
            items: [
                {
                    productId: 'p-1',
                    name: 'Paracetamol 650',
                    batchNo: 'VERYLONGBATCHNUMBER1234567890',
                    qty: 1,
                    mrp: 30,
                    rate: 30,
                }
            ],
            totalAmount: 30,
        };

        const { container } = render(<ManavataA4Invoice invoice={mockInvoice as any} />);
        
        // Find the batch th and td
        const batchTh = container.querySelector('th.break-words.whitespace-normal');
        expect(batchTh).toBeInTheDocument();
        expect(batchTh?.textContent).toBe('Batch');

        const batchTd = container.querySelector('td.break-words.whitespace-normal');
        expect(batchTd).toBeInTheDocument();
        expect(batchTd?.textContent).toContain('VERYLONGBATCHNUMBER1234567890');
    });

    it('renders dynamic Billed By cashier name in signature footer', () => {
        const mockInvoice = {
            id: 'inv-2',
            invoiceNo: 'INV-1002',
            invoiceDate: '2026-10-10',
            saleType: 'RETAIL',
            billedByName: 'Shivraj Dongave',
            items: [],
            totalAmount: 100,
            grandTotal: 100,
        };

        const { getByText } = render(<ManavataA4Invoice invoice={mockInvoice as any} />);
        expect(getByText('Billed By')).toBeInTheDocument();
        expect(getByText('Shivraj Dongave')).toBeInTheDocument();
    });

    it('prioritizes explicit billedBy prop over invoice object', () => {
        const mockInvoice = {
            id: 'inv-3',
            invoiceNo: 'INV-1003',
            invoiceDate: '2026-10-10',
            saleType: 'RETAIL',
            billedByName: 'Old Cashier',
            items: [],
            totalAmount: 100,
            grandTotal: 100,
        };

        const { getByText, queryByText } = render(
            <ManavataA4Invoice invoice={mockInvoice as any} billedBy="Pratik Pardeshi" />
        );
        expect(getByText('Billed By')).toBeInTheDocument();
        expect(getByText('Pratik Pardeshi')).toBeInTheDocument();
        expect(queryByText('Old Cashier')).not.toBeInTheDocument();
    });
});

