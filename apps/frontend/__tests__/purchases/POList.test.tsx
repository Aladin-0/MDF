import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { PurchaseOrdersList } from '@/components/purchases/PurchaseOrdersList';
import * as poHooks from '@/hooks/usePO';
import * as hooks from '@/hooks/usePurchases';
import { useAuthStore } from '@/store/authStore';

const replace = jest.fn();
let params = new URLSearchParams('');
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace }),
    usePathname: () => '/dashboard/purchases',
    useSearchParams: () => params,
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/hooks/usePurchases', () => ({ useDistributors: jest.fn(), useDistributorList: jest.fn() }));
jest.mock('@/hooks/usePO', () => ({
    usePOList: jest.fn(), usePOItems: jest.fn(() => ({})), usePODistributors: jest.fn(() => ({})), useInvalidatePO: () => jest.fn(),
}));
jest.mock('@/components/ui/date-range-picker', () => ({
    DatePickerWithRange: ({ setDate }: any) => (
        <div data-testid="mock-date-picker"><button data-testid="set-date-btn" onClick={() => setDate({ from: new Date('2026-10-01'), to: new Date('2026-10-10') })}>Set Date</button></div>
    ),
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));
Element.prototype.scrollIntoView = jest.fn();

describe('PurchaseOrdersList filter toolbar', () => {
    let usePOList: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        params = new URLSearchParams('');
        useAuthStore.setState({ user: { id: 'u', role: 'admin', permissions: ['view_purchases', 'create_purchases'], outlet: { id: 'o1' } } as never });
        (hooks.useDistributors as jest.Mock).mockReturnValue({ data: [{ id: '1', name: 'Acme Corp' }, { id: '2', name: 'Global Tech' }], isLoading: false });
        (hooks.useDistributorList as jest.Mock).mockReturnValue({ data: [], isLoading: false });
        usePOList = poHooks.usePOList as jest.Mock;
        usePOList.mockReturnValue({
            isLoading: false,
            data: {
                results: [{ id: '1', poNumber: 'PO-123', status: 'SAVED', statusLabel: 'Draft', distributorId: '1', distributorName: 'Acme Corp', orderDate: '2026-10-09', expectedDate: null, sentAt: null, sentVia: '', overdue: false, itemCount: 1, orderedQty: 5, receivedQty: 0, totalAmount: '100.00', closedShort: false }],
                pagination: { page: 1, pageSize: 25, totalPages: 1, totalRecords: 1 }, statusCounts: { OPEN: 1, SAVED: 1, ALL: 1 }, totals: { count: 1, amount: '100.00' },
            },
        });
    });

    it('searches by PO number or distributor (debounced)', async () => {
        render(<PurchaseOrdersList />);
        fireEvent.change(screen.getByPlaceholderText('PO number or distributor'), { target: { value: 'PO-123' } });
        await waitFor(() => expect(usePOList).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'PO-123' })), { timeout: 600 });
    });

    it('picking a distributor puts it in the URL (so it survives a refresh) and filters', async () => {
        const user = userEvent.setup();
        render(<PurchaseOrdersList />);
        await user.click(screen.getByText('All distributors').closest('button')!);
        await user.click(await screen.findByRole('option', { name: /Acme Corp/ }));
        expect(replace).toHaveBeenCalledWith(expect.stringContaining('dist=1'), expect.anything());
    });

    it('the filter follows the URL', () => {
        params = new URLSearchParams('dist=2&status=SENT');
        render(<PurchaseOrdersList />);
        expect(usePOList).toHaveBeenLastCalledWith(expect.objectContaining({ distributorId: '2', status: 'SENT' }));
    });

    it('applies a date range', async () => {
        const user = userEvent.setup();
        render(<PurchaseOrdersList />);
        await user.click(screen.getByTestId('set-date-btn'));
        expect(usePOList).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-10-01', endDate: '2026-10-10' }));
    });
});
