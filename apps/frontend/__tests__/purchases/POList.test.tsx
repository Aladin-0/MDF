import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PurchaseOrdersList } from '@/components/purchases/PurchaseOrdersList';
import * as hooks from '@/hooks/usePurchases';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
    }),
}));

jest.mock('@/hooks/usePurchases', () => ({
    usePurchaseOrders: jest.fn(),
    useDistributors: jest.fn(),
    useDistributorList: jest.fn(),
}));

jest.mock('@/components/ui/date-range-picker', () => ({
    DatePickerWithRange: ({ date, setDate }: any) => (
        <div data-testid="mock-date-picker">
            <button
                data-testid="set-date-btn"
                onClick={() => setDate({ from: new Date('2026-10-01'), to: new Date('2026-10-10') })}
            >
                Set Date
            </button>
        </div>
    )
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
}))
Element.prototype.scrollIntoView = jest.fn();

describe('PurchaseOrdersList Filter Toolbar', () => {
    let mockUsePurchaseOrders: jest.Mock;
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        (hooks.useDistributors as jest.Mock).mockReturnValue({
            data: [
                { id: '1', name: 'Acme Corp' },
                { id: '2', name: 'Global Tech' },
            ],
            isLoading: false
        });
        
        (hooks.useDistributorList as jest.Mock).mockReturnValue({
            data: [],
            isLoading: false
        });
        
        mockUsePurchaseOrders = hooks.usePurchaseOrders as jest.Mock;
        mockUsePurchaseOrders.mockReturnValue({
            data: [{ id: '1', poNumber: 'PO-123', status: 'SAVED', orderDate: '2026-10-09', totalAmount: 100 }],
            isLoading: false
        });
    });

    it('updates filter state when search input changes', async () => {
        render(<PurchaseOrdersList />);
        
        const searchInput = screen.getByPlaceholderText('Search by PO Number...');
        fireEvent.change(searchInput, { target: { value: 'PO-123' } });
        
        await waitFor(() => {
            expect(mockUsePurchaseOrders).toHaveBeenLastCalledWith(
                expect.objectContaining({ search: 'PO-123' })
            );
        }, { timeout: 500 }); // Accounts for the 300ms debounce
    });

    it('updates filter state when a distributor is selected', async () => {
        const user = userEvent.setup();
        render(<PurchaseOrdersList />);
        
        const combobox = screen.getByRole('combobox');
        await user.click(combobox);
        
        const acmeOption = await screen.findByText('Acme Corp');
        await user.click(acmeOption);
        
        expect(mockUsePurchaseOrders).toHaveBeenLastCalledWith(
            expect.objectContaining({ distributorId: '1' })
        );
    });

    it('updates filter state when date range is selected', async () => {
        const user = userEvent.setup();
        render(<PurchaseOrdersList />);
        
        const setDateBtn = screen.getByTestId('set-date-btn');
        await user.click(setDateBtn);
        
        expect(mockUsePurchaseOrders).toHaveBeenLastCalledWith(
            expect.objectContaining({
                startDate: '2026-10-01',
                endDate: '2026-10-10'
            })
        );
    });
});
