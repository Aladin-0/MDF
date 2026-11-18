import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BatchTrace } from '../BatchTrace';
import { downloadBatchTrace, fetchBatchTrace } from '@/lib/stockLedgerApi';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/stockLedgerApi', () => ({ fetchBatchTrace: jest.fn(), downloadBatchTrace: jest.fn() }));
const trace = fetchBatchTrace as jest.Mock;

const PACK = { pack_size: 10, pack_type: 'strip', pack_unit: 'tablet' };
const sale = (i: number, over = {}) => ({ invoice_id: `i${i}`, invoice_no: `INV-${i}`, date: '2026-11-0' + ((i % 9) + 1), customer: `Customer ${i}`, customer_phone: '98765000' + String(i).padStart(2, '0'), patient: '', qty_packs: 2, returned_packs: 0, pack_size: 10, ...over });
const data = (sales: any[], over = {}) => ({
    batch: {}, purchases: [{ invoice_id: 'p1', invoice_no: 'PINV-7', date: '2026-10-01', distributor: 'Alpha Agencies', qty_packs: 50 }], sales, salesTruncated: false, salesCount: sales.length,
    totals: { purchased_packs: 50, sold_packs: sales.length * 2, left_packs: 30 }, ...over,
});

function setup(extra: any = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><BatchTrace outletId="o1" batchId="b1" batchNumber="B1" pack={PACK} {...extra} /></QueryClientProvider>);
}

describe('BatchTrace', () => {
    beforeEach(() => jest.clearAllMocks());

    it('asks nothing until it is opened', () => {
        trace.mockResolvedValue(data([sale(1)]));
        setup();
        expect(trace).not.toHaveBeenCalled();
    });

    it('shows where it came from, who got it (and who it was for), and what is left', async () => {
        trace.mockResolvedValue(data([sale(1, { patient: 'Sita' }), sale(2)]));
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        expect(await screen.findByText(/Alpha Agencies · invoice PINV-7/)).toBeInTheDocument();
        const list = screen.getByRole('list', { name: 'Sales from this batch' });
        expect(within(list).getByText(/Customer 1/)).toHaveTextContent('for Sita');
        expect(within(list).getByText(/INV-2/)).toBeInTheDocument();
        expect(screen.getByText(/Bought 50 strips · sold 4 strips to 2 bills · 30 strips left/)).toBeInTheDocument();
    });

    it('says "No purchase record" for opening stock instead of "Bought 0"', async () => {
        trace.mockResolvedValue(data([sale(1)], { purchases: [], totals: { purchased_packs: 0, sold_packs: 2, left_packs: 0 } }));
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        expect(await screen.findByText(/No purchase record · sold 2 strips to 1 bill · none left/)).toBeInTheDocument();
    });

    it('says plainly when nothing was sold', async () => {
        trace.mockResolvedValue(data([], { totals: { purchased_packs: 50, sold_packs: 0, left_packs: 50 } }));
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        expect(await screen.findByText('Nothing has been sold from this batch.')).toBeInTheDocument();
    });

    it('lists the first 25 and shows the rest on request', async () => {
        trace.mockResolvedValue(data(Array.from({ length: 40 }, (_, i) => sale(i))));
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        const list = await screen.findByRole('list', { name: 'Sales from this batch' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(25);
        await userEvent.click(screen.getByRole('button', { name: 'Show all 40' }));
        expect(within(list).getAllByRole('listitem')).toHaveLength(40);
    });

    it('every invoice number opens its invoice (sales and the purchase), when allowed', async () => {
        trace.mockResolvedValue(data([sale(1), sale(2)]));
        const open = jest.fn();
        setup({ onOpenInvoice: open });
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        await userEvent.click(await screen.findByRole('button', { name: 'INV-2' }));
        expect(open).toHaveBeenLastCalledWith({ kind: 'sale', id: 'i2' });
        await userEvent.click(screen.getByRole('button', { name: 'invoice PINV-7' }));
        expect(open).toHaveBeenLastCalledWith({ kind: 'purchase', id: 'p1' });
    });

    it('a kind this person may not open stays plain text', async () => {
        trace.mockResolvedValue(data([sale(1)]));
        setup({ onOpenInvoice: jest.fn(), canOpen: (k: string) => k === 'purchase' });
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        await screen.findByRole('list', { name: 'Sales from this batch' });
        expect(screen.queryByRole('button', { name: 'INV-1' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'invoice PINV-7' })).toBeInTheDocument();
    });

    it('exports for a recall', async () => {
        trace.mockResolvedValue(data([sale(1)]));
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Export for a recall' }));
        await waitFor(() => expect(downloadBatchTrace).toHaveBeenCalledWith('o1', 'b1', 'batch-B1-who-received-it.xlsx'));
    });

    it('a failed load says why and can be retried', async () => {
        trace.mockRejectedValueOnce({ error: { message: 'Server down' } });
        setup();
        await userEvent.click(screen.getByRole('button', { name: 'Who received this batch' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
        trace.mockResolvedValue(data([sale(1)]));
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('list', { name: 'Sales from this batch' })).toBeInTheDocument();
    });
});
