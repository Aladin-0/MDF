import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomersPage from '@/app/dashboard/customers/page';
import CustomerStatCards from '@/components/customers/CustomerStatCards';
import { customersApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/apiClient', () => ({
    customersApi: { list: jest.fn(), getSummary: jest.fn(), getRefillAlerts: jest.fn() },
}));
// not what these tests are about (and they pull in the form's own dependencies)
jest.mock('@/components/customers/CustomerForm', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/customers/RefillAlertsBanner', () => ({ __esModule: true, default: () => null }));

const list = customersApi.list as jest.Mock;
const getSummary = customersApi.getSummary as jest.Mock;
const getRefillAlerts = customersApi.getRefillAlerts as jest.Mock;

const customer = (id: string, outstanding: number) => ({
    id, name: `Customer ${id}`, phone: '9000000000', outstanding, totalPurchases: 0, isChronic: false, isActive: true,
    createdAt: '2026-01-01T00:00:00', memberCount: 0,
});

const wrap = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
    jest.clearAllMocks();
    list.mockResolvedValue({ data: [customer('a', 100), customer('b', 50)], pagination: { page: 1, pageSize: 50, totalPages: 9, totalRecords: 420 } });
    getSummary.mockResolvedValue({ totalCustomers: 420, chronicCount: 37, withDuesCount: 120, totalOutstanding: 98765.5 });
    getRefillAlerts.mockResolvedValue([]);
});

describe('Customers page: what it asks the server for', () => {
    it('gets the counts from ONE summary request, not three full lists of customers', async () => {
        wrap(<CustomersPage />);
        await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(list).toHaveBeenCalled());
        // the only list request is the table itself (no unfiltered / chronic / outstanding lists just for counting)
        expect(list).toHaveBeenCalledTimes(1);
        expect(list.mock.calls[0][1]).toEqual(expect.objectContaining({ search: undefined }));
        expect(await screen.findByText('420')).toBeInTheDocument();
    });

    it('searches once typing pauses, not once per letter', async () => {
        jest.useFakeTimers();
        try {
            wrap(<CustomersPage />);
            await act(async () => { await Promise.resolve(); });
            const box = screen.getByPlaceholderText(/search name, phone/i);
            list.mockClear();
            for (const text of ['R', 'Ra', 'Ram', 'Rame', 'Rames', 'Ramesh']) {
                fireEvent.change(box, { target: { value: text } });
                act(() => { jest.advanceTimersByTime(100); });         // faster than the pause
            }
            expect(box).toHaveValue('Ramesh');                          // every key shows at once
            expect(list).not.toHaveBeenCalled();
            await act(async () => { jest.advanceTimersByTime(400); });
            await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
            expect(list.mock.calls[0][1]).toEqual(expect.objectContaining({ search: 'Ramesh' }));
            expect(list.mock.calls[0][2]).toBeInstanceOf(AbortSignal);  // an older search can be cancelled
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('CustomerStatCards', () => {
    it("shows the server's total over ALL customers (it used to add up only the first page)", async () => {
        wrap(<CustomerStatCards />);
        expect(await screen.findByText(/98,765\.5/)).toBeInTheDocument();    // not 150 (= 100 + 50 on page one)
        expect(screen.getByText('420')).toBeInTheDocument();
        expect(screen.getByText('120')).toBeInTheDocument();
        expect(list).not.toHaveBeenCalled();
    });
});
