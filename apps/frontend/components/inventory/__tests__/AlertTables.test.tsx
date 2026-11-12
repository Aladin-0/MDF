import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExpiryTable } from '../ExpiryTable';
import { LowStockTable } from '../LowStockTable';
import { inventoryApi } from '@/lib/apiClient';
import { poApi } from '@/lib/poApi';
import { exportToCSV } from '@/lib/export';
import { toDayString } from '@/lib/dates';
import { useInventoryStore } from '@/store/inventoryStore';

const mockToast = jest.fn();
let mockAllowed: string[] = ['adjust_stock', 'create_purchases'];
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: (p: string) => mockAllowed.includes(p) }) }));
jest.mock('@/lib/apiClient', () => ({ inventoryApi: { getStock: jest.fn() } }));
jest.mock('@/lib/poApi', () => ({ poApi: { shortbookAdd: jest.fn() } }));
jest.mock('@/lib/export', () => ({ exportToCSV: jest.fn() }));

const getStock = inventoryApi.getStock as jest.Mock;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toDayString(d); };

const batch = (id: string, days: number, over: Record<string, unknown> = {}) => ({
    id, batchNo: id.toUpperCase(), expiryDate: inDays(days), qtyStrips: 4, qtyLoose: 0, packSize: 10, packType: 'strip', packUnit: 'tablet',
    purchaseRate: 100, landingRate: 110, mrp: 150, rackLocation: 'R1', ...over,
});
const product = (id: string, batches: unknown[], over: Record<string, unknown> = {}) => ({
    id, name: `Product ${id}`, composition: 'Salt', manufacturer: 'Maker', packSize: 10, packType: 'strip', packUnit: 'tablet',
    totalStock: 4, total_qty_strips: 4, totalLoose: 0, nearestExpiry: inDays(10), minQty: 0, batches, ...over,
});
const pageOf = (rows: unknown[], page: number, totalPages: number, totalRecords: number) =>
    Promise.resolve({ data: rows, pagination: { page, totalPages, totalRecords, pageSize: 100 } });

const wrap = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
    jest.clearAllMocks();
    mockAllowed = ['adjust_stock', 'create_purchases'];
    useInventoryStore.setState({ valuationMode: 'PURCHASE' });
});

describe('ExpiryTable', () => {
    const rows = {
        expired: batch('exp1', -5),
        soon20: batch('soon20', 20),
        soon75: batch('soon75', 75),
        far: batch('far', 200),
        gone: batch('gone', -30, { qtyStrips: 0, qtyLoose: 0 }),
    };
    const first = product('A', [rows.expired, rows.soon20, rows.far, rows.gone]);
    const second = product('B', [rows.soon75]);

    beforeEach(() => {
        getStock.mockReset();
        getStock.mockImplementationOnce(() => pageOf([first], 1, 2, 2)).mockImplementationOnce(() => pageOf([second], 2, 2, 2));
    });

    it('loads every page, lists only stock that is still there and within 90 days, and counts it right', async () => {
        wrap(<ExpiryTable onAdjustClick={jest.fn()} />);
        expect(await screen.findByText('3 batches expiring within 90 days')).toBeInTheDocument();
        expect(getStock).toHaveBeenCalledTimes(2);
        expect(getStock).toHaveBeenNthCalledWith(1, 'o1', expect.objectContaining({ expiringSoon: true, page: 1, pageSize: 100 }));
        const table = screen.getByRole('table');
        expect(within(table).getByText('EXP1')).toBeInTheDocument();
        expect(within(table).getByText('SOON75')).toBeInTheDocument();      // came from page 2
        expect(within(table).queryByText('FAR')).not.toBeInTheDocument();   // 200 days away
        expect(within(table).queryByText('GONE')).not.toBeInTheDocument();  // expired but nothing left on the shelf
    });

    it('shows how many are in each window, and the Expired window lists expired stock first with a Write Off button', async () => {
        const onAdjustClick = jest.fn();
        wrap(<ExpiryTable onAdjustClick={onAdjustClick} />);
        await screen.findByText('3 batches expiring within 90 days');
        const windows = screen.getByRole('group', { name: 'Expiry window' });
        expect(within(windows).getByRole('button', { name: /expired\s*1/i })).toBeInTheDocument();
        expect(within(windows).getByRole('button', { name: /30 days\s*2/i })).toBeInTheDocument();
        expect(within(windows).getByRole('button', { name: /90 days\s*3/i })).toBeInTheDocument();

        await userEvent.click(within(windows).getByRole('button', { name: /expired/i }));
        expect(await screen.findByText('1 batch already expired')).toBeInTheDocument();
        expect(screen.getByText('Expired 5 days ago')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /write off batch exp1 of product a/i }));
        expect(onAdjustClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp1' }), expect.objectContaining({ id: 'A' }));
    });

    it('hides the adjust buttons from people who may not adjust stock', async () => {
        mockAllowed = [];
        wrap(<ExpiryTable onAdjustClick={jest.fn()} />);
        await screen.findByText('3 batches expiring within 90 days');
        expect(screen.queryByRole('button', { name: /adjust batch|write off/i })).not.toBeInTheDocument();
    });

    it('Export CSV really exports the visible list (the old button did nothing)', async () => {
        wrap(<ExpiryTable onAdjustClick={jest.fn()} />);
        await screen.findByText('3 batches expiring within 90 days');
        await userEvent.click(screen.getByRole('button', { name: /export csv/i }));
        expect(exportToCSV).toHaveBeenCalledTimes(1);
        const [data, name, columns] = (exportToCSV as jest.Mock).mock.calls[0];
        expect(name).toBe('expiring-stock');
        expect(data.map((r: any) => r.batch)).toEqual(['EXP1', 'SOON20', 'SOON75']);
        expect(columns.map((c: any) => c.label)).toEqual(expect.arrayContaining(['Product', 'Batch', 'Expiry Date', 'Days Left']));
    });

    it('values the stock at risk with the chosen valuation, and says which', async () => {
        wrap(<ExpiryTable onAdjustClick={jest.fn()} />);
        // 3 batches x 4 packs x 100 purchase rate
        expect(await screen.findByText(/stock value at risk: ₹1,200 \(at purchase price\)/i)).toBeInTheDocument();
    });

    it('says so when nothing is expiring, and a failed load shows why with a retry', async () => {
        getStock.mockReset();
        getStock.mockImplementationOnce(() => pageOf([], 1, 1, 0));
        const { unmount } = wrap(<ExpiryTable onAdjustClick={jest.fn()} />);
        expect(await screen.findByText(/nothing expires within 90 days/i)).toBeInTheDocument();
        unmount();

        getStock.mockReset();
        getStock.mockRejectedValueOnce({ detail: 'Server error' }).mockImplementationOnce(() => pageOf([second], 1, 1, 1));
        wrap(<ExpiryTable onAdjustClick={jest.fn()} />);
        expect(await screen.findByText(/couldn.t load expiring stock/i)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(await screen.findByText('SOON75')).toBeInTheDocument();
    });
});

describe('LowStockTable', () => {
    const few = product('A', [], { name: 'Few Left', totalStock: 3, total_qty_strips: 3, minQty: 0, packType: 'box' });
    const configured = product('B', [], { name: 'Configured', totalStock: 20, total_qty_strips: 20, minQty: 25 });
    const empty = product('C', [], { name: 'Sold Out', totalStock: 0, total_qty_strips: 0, minQty: 0 });

    beforeEach(() => {
        getStock.mockReset();
        getStock.mockImplementationOnce(() => pageOf([empty, few], 1, 2, 3)).mockImplementationOnce(() => pageOf([configured], 2, 2, 3));
        (poApi.shortbookAdd as jest.Mock).mockResolvedValue({});
    });

    it('loads every page and counts from the real total', async () => {
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        expect(await screen.findByText('3 products are below the reorder level')).toBeInTheDocument();
        expect(getStock).toHaveBeenCalledTimes(2);
        expect(screen.getByText(/1 of them is out of stock/i)).toBeInTheDocument();
        expect(screen.getByText('Configured')).toBeInTheDocument(); // page 2
    });

    it('uses the default level of 10 when none is set, the product\'s own when it is, and spells plurals right ("boxes")', async () => {
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        const fewRow = (await screen.findByText('Few Left')).closest('tr') as HTMLElement;
        expect(within(fewRow).getByText('10 boxes')).toBeInTheDocument();
        expect(within(fewRow).getByText('Need 7 more')).toBeInTheDocument();
        const configuredRow = screen.getByText('Configured').closest('tr') as HTMLElement;
        expect(within(configuredRow).getByText('25 strips')).toBeInTheDocument();
        expect(within(configuredRow).getByText('Need 5 more')).toBeInTheDocument();
        expect(within(screen.getByText('Sold Out').closest('tr') as HTMLElement).getByText('Out of stock')).toBeInTheDocument();
    });

    it('adds a product to the Shortbook with the shortage as the quantity, then shows it is in', async () => {
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Add to Shortbook: Few Left' }));
        expect(poApi.shortbookAdd).toHaveBeenCalledWith('o1', { productId: 'A', qty: 7, source: 'low_stock' });
        expect(await screen.findByRole('button', { name: 'In Shortbook: Few Left' })).toBeDisabled();
    });

    it('a failed add shows the real reason and what to do', async () => {
        (poApi.shortbookAdd as jest.Mock).mockRejectedValueOnce({ detail: 'Already ordered' });
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Add to Shortbook: Few Left' }));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: expect.stringContaining('Try again'), description: 'Already ordered' })));
    });

    it('exports each product\'s REAL reorder level and shortage (the old export wrote 10 for everyone)', async () => {
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        await screen.findByText('3 products are below the reorder level');
        await userEvent.click(screen.getByRole('button', { name: /export csv/i }));
        const [data, name] = (exportToCSV as jest.Mock).mock.calls[0];
        expect(name).toBe('low-stock');
        expect(data.map((r: any) => [r.product, r.level, r.shortage])).toEqual([
            ['Sold Out', 10, 10], ['Few Left', 10, 7], ['Configured', 25, 5],
        ]);
    });

    it('people who cannot order see no order buttons', async () => {
        mockAllowed = [];
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        await screen.findByText('3 products are below the reorder level');
        expect(screen.queryByRole('button', { name: /shortbook|purchase order/i })).not.toBeInTheDocument();
    });

    it('Create Purchase Order calls the handler', async () => {
        const onReorderClick = jest.fn();
        wrap(<LowStockTable onReorderClick={onReorderClick} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Create Purchase Order' }));
        expect(onReorderClick).toHaveBeenCalled();
    });

    it('celebrates an empty list instead of showing a broken table', async () => {
        getStock.mockReset();
        getStock.mockImplementationOnce(() => pageOf([], 1, 1, 0));
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        expect(await screen.findByText('Nothing is running low')).toBeInTheDocument();
    });
});
