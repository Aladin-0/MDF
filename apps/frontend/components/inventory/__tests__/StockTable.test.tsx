import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockTable } from '../StockTable';
import { getSearch, setUrl } from '../testing/navMock';
import { inventoryApi, productsApi } from '@/lib/apiClient';
import { useInventoryStore } from '@/store/inventoryStore';
import { toDayString } from '@/lib/dates';

jest.mock('next/navigation', () => require('../testing/navMock').navigationMock);
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
jest.mock('@/lib/apiClient', () => ({
    inventoryApi: { getStock: jest.fn() },
    productsApi: { update: jest.fn() },
}));

const getStock = inventoryApi.getStock as jest.Mock;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toDayString(d); };

const batch = (over: Record<string, unknown> = {}) => ({
    id: 'b1', batchNo: 'B1', expiryDate: inDays(400), qtyStrips: 5, qtyLoose: 0, packSize: 10, packType: 'strip', packUnit: 'tablet',
    purchaseRate: 100, landingRate: 110, mrp: 150, rackLocation: 'A1', ...over,
});
const product = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Dolo 650', composition: 'Paracetamol 650mg', manufacturer: 'Micro Labs', scheduleType: 'OTC',
    packSize: 10, packType: 'strip', packUnit: 'tablet', totalStock: 5, total_qty_strips: 5, totalLoose: 0,
    nearestExpiry: inDays(400), isLowStock: false, minQty: 0, batches: [batch()], ...over,
});
const reply = (rows: unknown[], extra: Record<string, unknown> = {}) =>
    ({ data: rows, pagination: { page: 1, pageSize: 50, totalPages: 1, totalRecords: rows.length, ...extra } });

function renderTable(props: Partial<React.ComponentProps<typeof StockTable>> = {}) {
    const onAdjustClick = jest.fn();
    const onEditClick = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><StockTable onAdjustClick={onAdjustClick} onEditClick={onEditClick} {...props} /></QueryClientProvider>);
    return { onAdjustClick, onEditClick, client };
}
const lastCall = () => getStock.mock.calls[getStock.mock.calls.length - 1][1];

describe('StockTable', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(() => {
        jest.clearAllMocks();
        setUrl('');
        useInventoryStore.setState({ valuationMode: 'PURCHASE' });
        getStock.mockResolvedValue(reply([product()]));
    });

    it('lists products, links the name to the detail page, and asks the server for page 1 sorted by name', async () => {
        renderTable();
        const link = await screen.findByRole('link', { name: 'Dolo 650' });
        expect(link).toHaveAttribute('href', '/dashboard/inventory/p1');
        expect(getStock).toHaveBeenCalledWith('o1', expect.objectContaining({ sortBy: 'name', sortOrder: 'asc', page: 1, pageSize: 50 }));
    });

    it('sorting is done by the server: clicking Stock asks for it ascending, then descending (the direction used to be dropped)', async () => {
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        await userEvent.click(screen.getByRole('button', { name: 'Stock' }));
        await waitFor(() => expect(lastCall()).toMatchObject({ sortBy: 'stock', sortOrder: 'asc' }));
        await userEvent.click(screen.getByRole('button', { name: 'Stock' }));
        await waitFor(() => expect(lastCall()).toMatchObject({ sortBy: 'stock', sortOrder: 'desc' }));
        expect(getSearch()).toContain('sort=stock');
        expect(getSearch()).toContain('order=desc');
        expect(screen.getByRole('columnheader', { name: /stock/i })).toHaveAttribute('aria-sort', 'descending');
    });

    it('only the columns the server can sort by are sortable', async () => {
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        for (const name of ['Product', 'Stock', 'Nearest Expiry']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Value' })).not.toBeInTheDocument();
    });

    it('does not scroll the page on first load (an effect on the page number scrolled the whole screen down)', async () => {
        const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        await new Promise((r) => setTimeout(r, 50));
        expect(scrollTo).not.toHaveBeenCalled();
        expect((window as any).HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('page size comes from the URL but is never more than the server returns (250 is not honoured)', async () => {
        setUrl('size=250&page=2');
        getStock.mockResolvedValue(reply([product()], { page: 2, totalPages: 3, totalRecords: 130 }));
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        expect(lastCall()).toMatchObject({ pageSize: 50, page: 2 });
        expect(screen.getByText(/of/i, { selector: 'p[role="status"]' }).textContent).toMatch(/51.100 of 130 products/);
    });

    it('searching asks once, on page 1, and puts the search in the URL', async () => {
        setUrl('page=3');
        getStock.mockResolvedValue(reply([product()], { page: 3, totalPages: 5, totalRecords: 250 }));
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        await userEvent.type(screen.getByLabelText('Search'), 'dolo');
        await waitFor(() => expect(getStock.mock.calls.some((c) => c[1].search === 'dolo')).toBe(true));
        const searches = getStock.mock.calls.filter((c) => c[1].search === 'dolo');
        expect(searches).toHaveLength(1);
        expect(searches[0][1].page).toBe(1);
        expect(getSearch()).toContain('q=dolo');
        expect(getSearch()).not.toContain('page=');
    });

    it('expanding a row shows its batches, and each batch can be adjusted on its own', async () => {
        const b1 = batch({ id: 'b1', batchNo: 'OLD1', qtyStrips: 0, qtyLoose: 0 });
        const b2 = batch({ id: 'b2', batchNo: 'NEW2' });
        const p = product({ batches: [b1, b2] });
        getStock.mockResolvedValue(reply([p]));
        const { onAdjustClick } = renderTable();
        await userEvent.click(await screen.findByRole('button', { name: /show 2 batches of dolo 650/i }));
        const table = screen.getByRole('table', { name: /batches of dolo 650/i });
        expect(within(table).getByText('OLD1')).toBeInTheDocument();
        expect(within(table).getByText('Empty')).toBeInTheDocument();
        await userEvent.click(within(table).getByRole('button', { name: /adjust stock of batch new2/i }));
        expect(onAdjustClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), expect.objectContaining({ id: 'p1' }));
    });

    it('the row-level Adjust button picks the first batch that has stock, not simply the first batch', async () => {
        const p = product({ batches: [batch({ id: 'b1', qtyStrips: 0, qtyLoose: 0 }), batch({ id: 'b2' })] });
        getStock.mockResolvedValue(reply([p]));
        const { onAdjustClick } = renderTable();
        await userEvent.click(await screen.findByRole('button', { name: 'Adjust stock of Dolo 650' }));
        expect(onAdjustClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b2' }), expect.anything());
    });

    it('values loose stock with the BATCH pack size, not the product one', async () => {
        // 2 packs + 5 loose of a 10-pack batch = 2.5 packs x 100 = 250 (the product says 5 per pack: that gave 300)
        getStock.mockResolvedValue(reply([product({ packSize: 5, batches: [batch({ qtyStrips: 2, qtyLoose: 5, packSize: 10, purchaseRate: 100 })] })]));
        renderTable();
        expect(await screen.findByText('₹250')).toBeInTheDocument();
    });

    it('flags expired stock in red with how long ago, and shows no date for the "none" placeholder', async () => {
        getStock.mockResolvedValue(reply([
            product({ id: 'e', name: 'Old Syrup', nearestExpiry: inDays(-12) }),
            product({ id: 'n', name: 'No Date', nearestExpiry: '2099-12-31' }),
        ]));
        renderTable();
        const oldRow = (await screen.findByRole('link', { name: 'Old Syrup' })).closest('tr') as HTMLElement;
        expect(within(oldRow).getByText('Expired 12 days ago')).toBeInTheDocument();
        const noDate = screen.getByRole('link', { name: 'No Date' }).closest('tr') as HTMLElement;
        expect(noDate.textContent).not.toMatch(/2099/);
    });

    it('marks out-of-stock and low-stock products', async () => {
        getStock.mockResolvedValue(reply([
            product({ id: 'a', name: 'Empty One', totalStock: 0, total_qty_strips: 0 }),
            product({ id: 'b', name: 'Few Left', totalStock: 3, total_qty_strips: 3, isLowStock: true }),
        ]));
        renderTable();
        expect(await screen.findByText('Out of stock')).toBeInTheDocument();
        expect(within((screen.getByRole('link', { name: 'Few Left' }).closest('tr')) as HTMLElement).getByText('Low')).toBeInTheDocument();
    });

    it('says why the list failed and lets you retry', async () => {
        getStock.mockRejectedValueOnce({ detail: 'Database is down' });
        renderTable();
        expect(await screen.findByText(/couldn.t load the stock list/i)).toBeInTheDocument();
        expect(screen.getByText(/database is down/i)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(await screen.findByRole('link', { name: 'Dolo 650' })).toBeInTheDocument();
    });

    it('explains an empty result and clears the filters without touching the tab or sort', async () => {
        setUrl('tab=all&sort=stock&q=zzz');
        getStock.mockResolvedValue(reply([]));
        renderTable();
        expect(await screen.findByText('No products match your filters')).toBeInTheDocument();
        await userEvent.click(screen.getAllByRole('button', { name: 'Clear Filters' })[0]);
        await waitFor(() => expect(getSearch()).not.toContain('q='));
        expect(getSearch()).toContain('sort=stock');
    });

    it('every control has a label', async () => {
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        for (const name of ['Search', 'Schedule', 'Quick edit (all outlets)']) expect(screen.getByLabelText(name)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View details of Dolo 650' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit Dolo 650' })).toBeInTheDocument();
    });

    it('a quick edit tells you what changed and where it applies, and Undo puts the old value back', async () => {
        (productsApi.update as jest.Mock).mockResolvedValue({});
        getStock.mockResolvedValue(reply([product({ gstRate: 5 })]));
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        await userEvent.click(screen.getByRole('combobox', { name: /quick edit \(all outlets\)/i }));
        await userEvent.click(await screen.findByRole('option', { name: 'GST Rate (%)' }));
        const input = await screen.findByLabelText('GST Rate (%) for Dolo 650');
        await userEvent.clear(input);
        await userEvent.type(input, '12{enter}');
        await waitFor(() => expect(productsApi.update).toHaveBeenCalledWith('p1', { gstRate: 12 }));

        const toast = mockToast.mock.calls.find((c) => c[0].title === 'Updated')![0];
        expect(toast.description).toBe('GST Rate (%) of Dolo 650: 5 → 12. Applies to every outlet.');
        toast.action.props.onClick();                                   // press Undo
        await waitFor(() => expect(productsApi.update).toHaveBeenLastCalledWith('p1', { gstRate: 5 }));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Change undone' })));
    });

    it('a rejected quick edit tells the user, and the cell shows the stored value again', async () => {
        (productsApi.update as jest.Mock).mockRejectedValue({ errors: { gstRate: 'GST rate 13% is not an active slab' } });
        getStock.mockResolvedValue(reply([product({ gstRate: 5 })]));
        renderTable();
        await screen.findByRole('link', { name: 'Dolo 650' });
        await userEvent.click(screen.getByRole('combobox', { name: /quick edit \(all outlets\)/i }));
        await userEvent.click(await screen.findByRole('option', { name: 'GST Rate (%)' }));
        const input = await screen.findByLabelText('GST Rate (%) for Dolo 650') as HTMLInputElement;
        await userEvent.clear(input);
        await userEvent.type(input, '13{enter}');
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Not saved', description: expect.stringContaining('not an active slab') })));
        await waitFor(() => expect(input.value).toBe('5'));
    });

    describe('dimming', () => {
        const hold = () => { let release!: (v: unknown) => void; const promise = new Promise((r) => { release = r; }); return { promise, release }; };

        it('a quiet background refresh (after a save, say) does NOT make the table flash', async () => {
            const { client } = renderTable();
            await screen.findByRole('link', { name: 'Dolo 650' });
            const slow = hold();
            getStock.mockImplementationOnce(() => slow.promise);
            await act(async () => { client.invalidateQueries({ queryKey: ['inventory'] }); });
            // screen readers are told it is refreshing, but nothing on screen dims
            await waitFor(() => expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true'));
            expect(screen.getByRole('table').className).not.toMatch(/opacity-60/);
            expect(screen.getByRole('link', { name: 'Dolo 650' })).toBeInTheDocument();      // the rows never left
            await act(async () => { slow.release(reply([product()])); });
        });

        it('but while the previous rows stand in for what you just asked for (a new sort), it dims, then clears', async () => {
            renderTable();
            await screen.findByRole('link', { name: 'Dolo 650' });
            const slow = hold();
            getStock.mockImplementationOnce(() => slow.promise);
            await userEvent.click(screen.getByRole('button', { name: 'Stock' }));
            await waitFor(() => expect(screen.getByRole('table').className).toMatch(/opacity-60/));
            await act(async () => { slow.release(reply([product()])); });
            await waitFor(() => expect(screen.getByRole('table').className).not.toMatch(/opacity-60/));
        });
    });
});
