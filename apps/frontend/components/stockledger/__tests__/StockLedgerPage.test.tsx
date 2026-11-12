import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockLedgerPage from '@/app/dashboard/stockledger/page';
import { fetchLedgerBatches, fetchLedgerPage } from '@/lib/stockLedgerApi';

// ── a tiny stateful stand-in for the Next.js URL ────────────────────────────
let mockSearch = '';
const mockListeners = new Set<() => void>();
const mockRouter = {
    replace: (href: string) => {
        mockSearch = href.split('?')[1] ?? '';
        window.history.replaceState({}, '', `/dashboard/stockledger${mockSearch ? `?${mockSearch}` : ''}`);
        mockListeners.forEach((l) => l());
    },
};
jest.mock('next/navigation', () => {
    const R = require('react');
    return {
        useRouter: () => mockRouter,
        usePathname: () => '/dashboard/stockledger',
        useSearchParams: () => {
            const s = R.useSyncExternalStore(
                (cb: () => void) => { mockListeners.add(cb); return () => mockListeners.delete(cb); },
                () => mockSearch,
                () => mockSearch,
            );
            return new URLSearchParams(s);
        },
    };
});
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/stockLedgerApi', () => ({
    fetchLedgerPage: jest.fn(),
    fetchLedgerBatches: jest.fn(),
    downloadLedgerExport: jest.fn(),
}));

const ledgerMock = fetchLedgerPage as jest.Mock;
const batchesMock = fetchLedgerBatches as jest.Mock;

const entry = (over: Record<string, unknown> = {}) => ({
    id: 'e1', batch_id: 'b1', product_id: 'p1', txn_date: '2026-11-05', txn_type: 'SALE_OUT', txn_type_label: 'Sale Out',
    voucher_type: 'Sale Invoice', voucher_number: 'INV-0001', party_name: 'Walk-in', product_name: 'Dolo 650', batch_number: 'B123',
    expiry_date: '2027-06-30', qty_in: 0, qty_out: 2, rate: 30, pack_size: 10, value_in: 0, value_out: 60,
    running_qty: 8, running_value: 240, created_at: '2026-11-05T10:30:00', ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
    entries: [entry()],
    summary: { total_in: 120, total_out: 40, total_value_in: 3600, total_value_out: 1200 },
    totalRecords: 1,
    totalPages: 1,
    ...over,
});

const batch = (over: Record<string, unknown> = {}) => ({
    batch_id: 'b1', batch_number: 'B123', product_name: 'Dolo 650', qty_remaining: 8, pack_size: 10, expiry_date: '2027-06-30', ...over,
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><StockLedgerPage /></QueryClientProvider>);
}

const setUrl = (qs: string) => { mockSearch = qs; window.history.replaceState({}, '', `/dashboard/stockledger?${qs}`); };

describe('Stock Ledger page', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        setUrl('from=2026-11-01&to=2026-11-10');
        ledgerMock.mockResolvedValue(page());
        batchesMock.mockResolvedValue([batch()]);
    });

    it('labels every control and lists the movements', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { level: 1, name: 'Stock Ledger' })).toBeInTheDocument();
        for (const name of ['From', 'To', 'Search']) expect(screen.getByLabelText(name)).toBeInTheDocument();
        expect(await screen.findByText('INV-0001')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Refresh ledger' })).toBeInTheDocument();
    });

    it('fills in the default dates in the URL without breaking the first load', async () => {
        setUrl('');
        mockSearch = '';
        renderPage();
        await waitFor(() => expect(mockSearch).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/));
        await waitFor(() => expect(ledgerMock).toHaveBeenCalled());
        expect(ledgerMock.mock.calls[0][0].from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('says what the totals are: money first, quantities as packs, never "Entries"', async () => {
        renderPage();
        expect(await screen.findByText('120 packs received')).toBeInTheDocument();
        expect(screen.getByText('40 packs dispensed')).toBeInTheDocument();
        const summary = screen.getByRole('group', { name: /summary for the selected period/i });
        expect(within(summary).queryByText(/entries/i)).not.toBeInTheDocument();
    });

    it('fetches once per filter change, on page 1 (it used to fetch with the new filter and the OLD page first)', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&page=3');
        ledgerMock.mockResolvedValue(page({ totalRecords: 300, totalPages: 6 }));
        renderPage();
        await waitFor(() => expect(ledgerMock).toHaveBeenCalledTimes(1));
        expect(ledgerMock.mock.calls[0][0].page).toBe(3);

        await userEvent.type(screen.getByLabelText('Search'), 'dolo');
        await waitFor(() => expect(ledgerMock.mock.calls.some((c) => c[0].q === 'dolo')).toBe(true));

        const withSearch = ledgerMock.mock.calls.filter((c) => c[0].q === 'dolo');
        expect(withSearch).toHaveLength(1);
        expect(withSearch[0][0].page).toBe(1);
        expect(mockSearch).toContain('q=dolo');
        expect(mockSearch).not.toContain('page=');
    });

    it('does not ask the server when the start date is after the end date, and explains why', async () => {
        setUrl('from=2026-11-10&to=2026-11-01');
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent(/start date must be on or before the end date/i);
        await new Promise((r) => setTimeout(r, 50));
        expect(ledgerMock).not.toHaveBeenCalled();
    });

    it('shows a real error with a retry when the ledger cannot load', async () => {
        ledgerMock.mockRejectedValueOnce({ detail: 'Server exploded' });
        renderPage();
        const alert = await screen.findByText(/couldn.t load the ledger/i);
        expect(alert).toBeInTheDocument();
        expect(screen.getByText(/Server exploded/)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(await screen.findByText('INV-0001')).toBeInTheDocument();
    });

    it('does NOT claim "No batches found" when the batch list failed to load', async () => {
        batchesMock.mockRejectedValueOnce({ detail: 'Batches are down' });
        renderPage();
        expect(await screen.findByText(/couldn.t load batches/i)).toBeInTheDocument();
        expect(screen.queryByText(/no batches/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    });

    it('selecting a batch is a pressed button, goes into the URL, and shows the CURRENT stock (not period movement)', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&batch=b1');
        batchesMock.mockResolvedValue([batch({ qty_remaining: 5, pack_size: 10 })]);
        renderPage();
        expect(await screen.findByText(/now in stock/i)).toBeInTheDocument();
        const panel = screen.getAllByRole('region', { name: 'Batches' })[0];
        expect(within(panel).getByRole('button', { name: /dolo 650/i })).toHaveAttribute('aria-pressed', 'true');
        // the table hides the product column when one batch is open
        expect(screen.queryByRole('columnheader', { name: /product/i })).not.toBeInTheDocument();
    });

    it('says why the table is empty and offers a way out when filters are on', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&q=zzz');
        ledgerMock.mockResolvedValue(page({ entries: [], totalRecords: 0, summary: { total_in: 0, total_out: 0, total_value_in: 0, total_value_out: 0 } }));
        renderPage();
        expect(await screen.findByText('No movements match your filters')).toBeInTheDocument();
        await act(async () => { await userEvent.click(screen.getAllByRole('button', { name: 'Clear Filters' })[0]); });
        await waitFor(() => expect(mockSearch).not.toContain('q='));
    });
});
