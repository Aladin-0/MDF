import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

let mockSearch = new URLSearchParams('');
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'L1' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useSearchParams: () => mockSearch,
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/ui/SortDropdown', () => ({ SortDropdown: () => <div data-testid="sort" /> }));
jest.mock('@/components/purchases/PurchaseDetailModal', () => ({ PurchaseDetailModal: () => null }));
jest.mock('@/components/accounts/VoucherDetailModal', () => ({ VoucherDetailModal: () => null }));
jest.mock('@/lib/apiClient', () => ({
    voucherApi: { getLedgerStatement: jest.fn() },
    purchasesApi: { getById: jest.fn() },
    API_URL: 'http://api.test',
    getHeaders: () => ({}),
}));

import { voucherApi } from '@/lib/apiClient';
import LedgerStatementPage from '@/app/dashboard/accounts/ledgers/[id]/page';

const get = voucherApi.getLedgerStatement as jest.Mock;

const tx = (i: number, over: Record<string, unknown> = {}) => ({ date: '2026-11-09', voucherNo: `V-${i}`, voucherType: 'receipt', description: `entry ${i}`, debit: i, credit: 0, balance: i, sourceType: 'VOUCHER', sourceId: `s${i}`, journalEntryId: '', ...over });
const statement = (over: { page?: number; total?: number; rows?: any[]; size?: number; extra?: Record<string, unknown> } = {}) => {
    const size = over.size ?? 200, total = over.total ?? 1520, page = over.page ?? 1;
    const rows = over.rows ?? Array.from({ length: Math.min(size, total - (page - 1) * size) }, (_, i) => tx((page - 1) * size + i + 1));
    return {
        ledger: { id: 'L1', name: 'Cash', groupName: 'Cash in Hand', nature: 'asset', balanceType: 'Dr' }, openingBalance: 0, closingBalance: 604948.8, balanceType: 'Dr',
        totalDebit: 661230.8, totalCredit: 56282, totalEntries: 1520, transactions: rows,
        pagination: { page, page_size: size, total_count: total, total_pages: Math.max(1, Math.ceil(total / size)), has_more: page * size < total }, ...over.extra,
    };
};
beforeEach(() => { get.mockReset(); mockSearch = new URLSearchParams(''); get.mockImplementation(async (_id, _f, _t, _o, page = 1) => statement({ page })); });

const calls = () => get.mock.calls.map((c) => ({ id: c[0], from: c[1], to: c[2], order: c[3], page: c[4], size: c[5], search: c[6] }));

describe('Ledger statement page', () => {
    it('opens on the latest entries: sorted newest first, one page of 200, page 1', async () => {
        render(<LedgerStatementPage />);
        expect(await screen.findByText('V-1')).toBeInTheDocument();
        expect(calls()[0]).toMatchObject({ id: 'L1', order: 'desc', page: 1, size: 200, search: '' });
        expect(screen.getByRole('navigation', { name: 'Statement pages' })).toHaveTextContent('Showing 1–200 of 1520 entries');
        expect(screen.getByText('Page 1 of 8')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('the pager reaches every entry: Next, Last and back to First each ask the server for that page', async () => {
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('V-201')).toBeInTheDocument();
        expect(screen.queryByText('V-1')).not.toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Statement pages' })).toHaveTextContent('Showing 201–400 of 1520 entries');
        fireEvent.click(screen.getByRole('button', { name: 'Last' }));
        expect(await screen.findByText('V-1401')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Statement pages' })).toHaveTextContent('Showing 1401–1520 of 1520 entries');
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'First' }));
        expect(await screen.findByText('V-1')).toBeInTheDocument();
        expect(calls().map((c) => c.page)).toEqual([1, 2, 8, 1]);
    });

    it('changing page keeps the table on screen instead of flashing a loading screen', async () => {
        let release!: (v: unknown) => void;
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        get.mockImplementationOnce(() => new Promise((r) => { release = r; }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('V-1')).toBeInTheDocument();                                  // still there while page 2 loads
        expect(screen.queryByText('Loading statement…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();                  // no double clicks
        await act(async () => { release(statement({ page: 2 })); });
        expect(await screen.findByText('V-201')).toBeInTheDocument();
    });

    it('search goes to the server (debounced) and returns to page 1, with totals of the matches across all pages', async () => {
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('V-201');
        get.mockImplementation(async (_i, _f, _t, _o, page = 1, _s, search) => (search
            ? statement({ page, total: 1, rows: [tx(900, { voucherNo: 'CON-2026-0001', voucherType: 'contra', description: 'Cash deposited', debit: 0, credit: 35000 })], extra: { filteredDebit: 0, filteredCredit: 35000 } })
            : statement({ page })));
        fireEvent.change(screen.getByPlaceholderText('Search entries…'), { target: { value: 'CON-2026' } });
        expect(await screen.findByText('CON-2026-0001', {}, { timeout: 4000 })).toBeInTheDocument();
        const last = calls()[calls().length - 1];
        expect(last).toMatchObject({ search: 'CON-2026', page: 1 });                          // back to page 1 for the new search
        expect(calls().filter((c) => c.search === 'CON-2026')).toHaveLength(1);              // one request, not one per keystroke
        expect(screen.getByText('Matching Totals (1 entries)')).toBeInTheDocument();
        expect(screen.getByText('(1 match)')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Statement pages' })).not.toBeInTheDocument();      // a single page needs no pager
    });

    it('a search with no matches says so', async () => {
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        get.mockImplementation(async () => statement({ total: 0, rows: [] }));
        fireEvent.change(screen.getByPlaceholderText('Search entries…'), { target: { value: 'zzz' } });
        expect(await screen.findByText('No entries match "zzz"', {}, { timeout: 4000 })).toBeInTheDocument();
    });

    it('Apply Filter loads the chosen dates from page 1; the date boxes alone change nothing', async () => {
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('V-201');
        const before = calls().length;
        const [fromInput] = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
        fireEvent.change(fromInput, { target: { value: '2026-10-01' } });
        expect(calls()).toHaveLength(before);                                                   // typing a date does not reload
        fireEvent.click(screen.getByRole('button', { name: /Apply Filter/ }));
        await waitFor(() => expect(calls()).toHaveLength(before + 1));
        expect(calls()[before]).toMatchObject({ from: '2026-10-01', page: 1 });
    });

    it('a ledger that fits on one page has no pager', async () => {
        get.mockImplementation(async () => statement({ total: 12, size: 200 }));
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        expect(screen.queryByRole('navigation', { name: 'Statement pages' })).not.toBeInTheDocument();
    });

    it('the footer and summary report all entries, not just the page on screen', async () => {
        render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        expect(screen.getByText('Overall Totals (1520 entries)')).toBeInTheDocument();
        const summary = screen.getByText('Transactions').closest('div')!;
        expect(within(summary).getByText('1520')).toBeInTheDocument();
    });

    it('another sort order starts again from page 1', async () => {
        const { rerender } = render(<LedgerStatementPage />);
        await screen.findByText('V-1');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('V-201');
        mockSearch = new URLSearchParams('sort=asc');
        rerender(<LedgerStatementPage />);
        await waitFor(() => expect(calls()[calls().length - 1]).toMatchObject({ order: 'asc', page: 1 }));
        expect(calls().filter((c) => c.order === 'asc' && c.page === 2)).toHaveLength(0);       // never asked for page 2 of the new order
    });
});
