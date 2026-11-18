import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpiryManagerPage from '../page';
import { getSearch, setUrl } from '@/components/inventory/testing/navMock';
import { row } from '@/components/expiry/testing/fixtures';
import { assignBatchSupplier, downloadExpiryExport, downloadExpirySelected, fetchAllExpiryRows, fetchExpiry, removeExpiryStock } from '@/lib/expiryApi';

const mockToast = jest.fn();
let mockCanAdjust = true;
jest.mock('next/navigation', () => require('@/components/inventory/testing/navMock').navigationMock);
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: (p: string) => (p === 'adjust_stock' ? mockCanAdjust : true) }) }));
jest.mock('@/hooks/usePurchases', () => ({ useDistributors: () => ({ data: [{ id: 'd1', name: 'Alpha Agencies' }, { id: 'd2', name: 'Beta Pharma' }] }) }));
jest.mock('@/lib/expiryApi', () => ({
    fetchExpiry: jest.fn(), fetchAllExpiryRows: jest.fn(), downloadExpiryExport: jest.fn(), downloadExpirySelected: jest.fn(), removeExpiryStock: jest.fn(), assignBatchSupplier: jest.fn(),
}));

const ROWS = [row('a'), row('b', { daysToExpiry: -3 }), row('c', { distributorId: 'd2', distributorName: 'Beta Pharma', purchaseInvoiceId: 'inv2', purchaseInvoiceNo: 'B-9' })];
const answer = (rows = ROWS, extra: any = {}) => ({
    data: rows,
    totals: { batches: rows.length, products: rows.length, expiredBatches: 1, mrpValue: 1590, distributors: 2, costValue: 954 },
    groups: [{ distributorId: 'd1', name: 'Alpha Agencies', batches: 2, mrpValue: 1060, costValue: 636 }, { distributorId: 'd2', name: 'Beta Pharma', batches: 1, mrpValue: 530, costValue: 318 }],
    pagination: { page: 1, pageSize: 50, total: rows.length, pages: 1 },
    ...extra,
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ExpiryManagerPage /></QueryClientProvider>);
}
const table = () => screen.getByRole('table');
const tick = async (label: string) => userEvent.click(within(table()).getByLabelText(label));

describe('Expiry Manager page', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(() => {
        jest.clearAllMocks();
        setUrl('');
        mockCanAdjust = true;
        (fetchExpiry as jest.Mock).mockResolvedValue(answer());
    });

    it('opens on the next 90 days (plus expired) and shows the rows, the totals and a chip per distributor', async () => {
        renderPage();
        expect(await within(await screen.findByRole('table')).findByText('Medicine A')).toBeInTheDocument();
        expect((fetchExpiry as jest.Mock).mock.calls[0][1]).toMatchObject({ w: '90', includeExpired: true });
        expect(screen.getByText('₹954')).toBeInTheDocument();                         // cost at risk, from the server
        expect(screen.getByRole('button', { name: /Alpha Agencies\s*2/ })).toBeInTheDocument();
    });

    it('changing the window asks again and is kept in the URL', async () => {
        renderPage();
        await screen.findByRole('table');
        await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
        expect(getSearch()).toBe('w=next-month');
        await waitFor(() => expect((fetchExpiry as jest.Mock).mock.calls.some((c) => c[1].w === 'next-month')).toBe(true));
    });

    it('clicking a distributor chip narrows the list to that distributor', async () => {
        renderPage();
        await screen.findByRole('table');
        await userEvent.click(screen.getByRole('button', { name: /Beta Pharma\s*1/ }));
        expect(getSearch()).toBe('dist=d2');
    });

    it('asks nothing until a month is picked', async () => {
        setUrl('w=months');
        renderPage();
        expect(await screen.findByText(/Pick one or more months above/)).toBeInTheDocument();
        expect(fetchExpiry).not.toHaveBeenCalled();
    });

    it('says so when nothing expires in the window', async () => {
        (fetchExpiry as jest.Mock).mockResolvedValue(answer([], { totals: { batches: 0, products: 0, expiredBatches: 0, mrpValue: 0, distributors: 0 }, groups: [] }));
        renderPage();
        expect(await screen.findByText('Nothing expires in this window.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Export all to Excel/ })).toBeDisabled();
    });

    it('a failed load shows the reason and a way to try again', async () => {
        (fetchExpiry as jest.Mock).mockRejectedValueOnce({ error: { message: 'Server is down' } });
        renderPage();
        expect(await screen.findByText(/Server is down/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await within(await screen.findByRole('table')).findByText('Medicine A')).toBeInTheDocument();
    });

    it('ticking rows shows what is selected and its value, and exports exactly those', async () => {
        renderPage();
        await screen.findByRole('table');
        await tick('Select Medicine A, batch B-A');
        await tick('Select Medicine C, batch B-C');
        const bar = screen.getByRole('region', { name: /Actions for the selected batches/ });
        expect(bar).toHaveTextContent('2 batches selected');
        expect(bar).toHaveTextContent('Cost ₹636');
        await userEvent.click(within(bar).getByRole('button', { name: /Export/ }));
        await waitFor(() => expect(downloadExpirySelected).toHaveBeenCalledWith('o1', ['a', 'c']));
    });

    it('with nothing ticked, "Export all" exports every match', async () => {
        renderPage();
        await screen.findByRole('table');
        await userEvent.click(screen.getByRole('button', { name: /Export all to Excel/ }));
        await waitFor(() => expect(downloadExpiryExport).toHaveBeenCalled());
        expect(downloadExpirySelected).not.toHaveBeenCalled();
    });

    it('offers "select all N that match" when the page is ticked and there is more, and uses the server\'s totals', async () => {
        (fetchExpiry as jest.Mock).mockImplementation((_o, _f, q) => Promise.resolve(q.withIds
            ? answer(ROWS, { matchingIds: ['a', 'b', 'c', 'x', 'y'], pagination: { page: 1, pageSize: 1, total: 5, pages: 5 } })
            : answer(ROWS, { totals: { batches: 5, products: 5, expiredBatches: 1, mrpValue: 2650, distributors: 2, costValue: 1590 }, pagination: { page: 1, pageSize: 3, total: 5, pages: 2 } })));
        renderPage();
        await screen.findByRole('table');
        await userEvent.click(within(table()).getByLabelText('Select every batch on this page'));
        await userEvent.click(await screen.findByRole('button', { name: 'Select all 5 that match' }));
        expect(await screen.findByText(/All 5 matching batches are selected/)).toBeInTheDocument();
        expect(screen.getByRole('region', { name: /Actions for the selected/ })).toHaveTextContent('5 batches selected');
        expect(screen.getByRole('region', { name: /Actions for the selected/ })).toHaveTextContent('Cost ₹1,590');
    });

    it('changing a filter clears what was ticked (the rows are different now)', async () => {
        renderPage();
        await screen.findByRole('table');
        await tick('Select Medicine A, batch B-A');
        await userEvent.click(screen.getByRole('button', { name: '30 days' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: /Actions for the selected/ })).not.toBeInTheDocument());
    });

    it('removes the ticked batches: confirm with a PIN, then the list refreshes and the cost written off is reported', async () => {
        (removeExpiryStock as jest.Mock).mockResolvedValue({ success: true, batches: 2, costValue: 636, removed: [] });
        renderPage();
        await screen.findByRole('table');
        await tick('Select Medicine A, batch B-A');
        await tick('Select Medicine B, batch B-B');
        await userEvent.click(screen.getByRole('button', { name: /Remove from stock/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Remove from stock' });
        await userEvent.type(within(dialog).getByLabelText(/Your password/), 'MyPass#1');
        const before = (fetchExpiry as jest.Mock).mock.calls.length;
        await userEvent.click(within(dialog).getByRole('button', { name: 'Remove 2 batches from stock' }));
        await waitFor(() => expect(removeExpiryStock).toHaveBeenCalledWith('o1', expect.objectContaining({ password: 'MyPass#1', items: [{ batchId: 'a' }, { batchId: 'b' }] })));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect((fetchExpiry as jest.Mock).mock.calls.length).toBeGreaterThan(before));   // refreshed
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '2 batches removed from stock', description: expect.stringContaining('₹636') }));
        expect(screen.queryByRole('region', { name: /Actions for the selected/ })).not.toBeInTheDocument();
    });

    it('batches ticked via "select all" that are not on screen are fetched before the removal list is shown', async () => {
        (fetchExpiry as jest.Mock).mockImplementation((_o, _f, q) => Promise.resolve(q.withIds
            ? answer(ROWS, { matchingIds: ['a', 'b', 'c', 'x'], pagination: { page: 1, pageSize: 1, total: 4, pages: 4 } })
            : answer(ROWS, { pagination: { page: 1, pageSize: 3, total: 4, pages: 2 } })));
        (fetchAllExpiryRows as jest.Mock).mockResolvedValue([...ROWS, row('x')]);
        renderPage();
        await screen.findByRole('table');
        await userEvent.click(within(table()).getByLabelText('Select every batch on this page'));
        await userEvent.click(await screen.findByRole('button', { name: 'Select all 4 that match' }));
        await userEvent.click(screen.getByRole('button', { name: /Remove from stock/ }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Medicine X')).toBeInTheDocument();
        expect(fetchAllExpiryRows).toHaveBeenCalled();
    });

    it('return to distributor groups the batches by invoice', async () => {
        renderPage();
        await screen.findByRole('table');
        await tick('Select Medicine A, batch B-A');
        await tick('Select Medicine C, batch B-C');
        await userEvent.click(screen.getByRole('button', { name: /Return to distributor/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Return to distributor' });
        expect(within(dialog).getAllByRole('link', { name: /Make debit note/ })).toHaveLength(2);
    });

    it('assigns a distributor to ticked stock that has no purchase invoice, then refreshes', async () => {
        (fetchExpiry as jest.Mock).mockResolvedValue(answer([row('a', { purchaseInvoiceId: null, purchaseInvoiceNo: '', distributorId: null, distributorName: '' }), row('b')]));
        (assignBatchSupplier as jest.Mock).mockResolvedValue({ updated: 1, skipped: [{ batchId: 'b', reason: 'HAS_PURCHASE' }], distributor: 'Alpha Agencies' });
        renderPage();
        await screen.findByRole('table');
        await tick('Select Medicine A, batch B-A');
        await tick('Select Medicine B, batch B-B');
        await userEvent.click(screen.getByRole('button', { name: /Assign distributor/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Assign a distributor' });
        await userEvent.selectOptions(within(dialog).getByLabelText('Distributor'), 'd1');
        const before = (fetchExpiry as jest.Mock).mock.calls.length;
        await userEvent.click(within(dialog).getByRole('button', { name: 'Assign to 1 batch' }));
        await waitFor(() => expect(assignBatchSupplier).toHaveBeenCalledWith('o1', ['a'], 'd1'));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect((fetchExpiry as jest.Mock).mock.calls.length).toBeGreaterThan(before));
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '1 batch assigned to Alpha Agencies', description: expect.stringContaining('1 left alone') }));
    });

    it('people who may not adjust stock can export but not remove or return', async () => {
        mockCanAdjust = false;
        renderPage();
        await screen.findByRole('table');
        await tick('Select Medicine A, batch B-A');
        const bar = screen.getByRole('region', { name: /Actions for the selected/ });
        expect(within(bar).getByRole('button', { name: /Export/ })).toBeInTheDocument();
        expect(within(bar).queryByRole('button', { name: /Remove from stock/ })).not.toBeInTheDocument();
        expect(within(bar).queryByRole('button', { name: /Return to distributor/ })).not.toBeInTheDocument();
    });

    it('shows "Hidden" for cost at risk when the server sent no cost figures', async () => {
        (fetchExpiry as jest.Mock).mockResolvedValue(answer(ROWS.map((r) => ({ ...r, costValue: undefined })), { totals: { batches: 3, products: 3, expiredBatches: 1, mrpValue: 1590, distributors: 2 } }));
        renderPage();
        await screen.findByRole('table');
        expect(screen.getByText('Hidden')).toBeInTheDocument();
        expect(within(table()).getByRole('columnheader', { name: 'MRP value' })).toBeInTheDocument();
    });
});
