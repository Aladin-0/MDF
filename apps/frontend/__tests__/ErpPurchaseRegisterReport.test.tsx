import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErpPurchaseRegisterReport } from '../components/reports/ErpPurchaseRegisterReport';
import ReportsCenterPage from '../app/dashboard/reports/page';
import { getErpPurchaseBook, getErpPurchaseReturnBook } from '../lib/apiClient';

jest.mock('../hooks/useOutletId', () => ({ useOutletId: jest.fn(() => 'outlet-1') }));
jest.mock('../hooks/usePermissions', () => ({
    usePermissions: () => ({ hasPermission: () => true }),
}));
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/apiClient', () => ({
    exportErpReport: jest.fn(),
    getErpPurchaseBook: jest.fn(),
    getErpPurchaseReturnBook: jest.fn(),
}));

const summary = {
    total_bill_amt: 917,
    total_taxable: 866.55,
    total_tax: 50.84,
    total_tax_free: 0,
    total_exempted: 0,
    total_round_off: -0.39,
    bill_count: 1,
    return_count: 1,
    return_amount: 150,
};

const detailedBook = {
    format: 'detailed',
    summary,
    rows: [
        {
            date: '2026-10-31', bill_no: 'AAH013970', party_name: 'HRIM MEDICARE', bill_amt: 1067,
            taxable: 1016.55, tax: 50.84, tax_free: 0, exempted: 0, round_off: -0.39, is_return: false,
        },
        {
            date: '2026-10-31', bill_no: 'DN00001', party_name: 'URD PURCHASE', bill_amt: -150,
            taxable: -150, tax: 0, tax_free: 0, exempted: 0, round_off: 0, is_return: true,
        },
    ],
};

function renderWithClient(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ErpPurchaseRegisterReport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (require('../hooks/useOutletId').useOutletId as jest.Mock).mockReturnValue('outlet-1');
    });

    it('Purchase Book: requests a plain register (no returns netted) and renders Marg columns, rows and totals', async () => {
        (getErpPurchaseBook as jest.Mock).mockResolvedValue(detailedBook);
        renderWithClient(<ErpPurchaseRegisterReport kind="purchase-book" />);

        expect(await screen.findByText('HRIM MEDICARE')).toBeInTheDocument();

        const args = (getErpPurchaseBook as jest.Mock).mock.calls[0];
        expect(args[0]).toBe('outlet-1');
        expect(args[1]).toMatchObject({ format: 'detailed', lessReturns: false });

        for (const header of ['Date', 'Bill No', 'Party Name', 'Bill Amt', 'Taxable', 'Tax', 'Tax Free', 'Exempted', 'R.Off']) {
            expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
        }

        // The netted return row is flagged, and the footer carries the grand totals.
        expect(screen.getByText('Return')).toBeInTheDocument();
        const footer = document.querySelector('tfoot') as HTMLElement;
        expect(within(footer).getByText('₹917.00')).toBeInTheDocument();
        expect(within(footer).getByText('₹866.55')).toBeInTheDocument();
        expect(within(footer).getByText(/Total \(1 Bills\)/)).toBeInTheDocument();
        expect(screen.getByText('Less Returns')).toBeInTheDocument();
    });

    it('Consolidated Purchase Book: defaults to summarised mode with returns netted off', async () => {
        (getErpPurchaseBook as jest.Mock).mockResolvedValue({
            format: 'summarised',
            summary,
            rows: [{
                date: '2026-10-31', bill_count: 1, return_count: 1, bill_amt: 917, taxable: 866.55, tax: 50.84,
                tax_free: 0, exempted: 0, round_off: -0.39,
            }],
        });
        renderWithClient(<ErpPurchaseRegisterReport kind="consolidated-purchase-book" />);

        expect(await screen.findByRole('columnheader', { name: 'Bills' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Party Name' })).not.toBeInTheDocument();
        expect((getErpPurchaseBook as jest.Mock).mock.calls[0][1]).toMatchObject({
            format: 'summarised', lessReturns: true,
        });
        expect(screen.getByRole('heading', { name: 'Consolidated Purchase Book' })).toBeInTheDocument();
    });

    it('Purchase Return Book: uses the debit-note endpoint and has no Less Returns switch', async () => {
        (getErpPurchaseReturnBook as jest.Mock).mockResolvedValue({
            format: 'detailed',
            summary: { ...summary, total_bill_amt: 150, bill_count: 0, return_count: 1 },
            rows: [{
                date: '2026-09-09', bill_no: 'DN00001', party_name: 'URD PURCHASE', bill_amt: 150,
                taxable: 150, tax: 0, tax_free: 0, exempted: 0, round_off: 0, is_return: true,
            }],
        });
        renderWithClient(<ErpPurchaseRegisterReport kind="purchase-return-book" />);

        expect(await screen.findByText('DN00001')).toBeInTheDocument();
        expect(getErpPurchaseBook).not.toHaveBeenCalled();
        expect(screen.queryByText('Less Returns')).not.toBeInTheDocument();
        // Return rows in the return book are not badged individually.
        expect(screen.queryByText('Return')).not.toBeInTheDocument();
        expect(screen.getByText(/Total \(1 Returns\)/)).toBeInTheDocument();
    });

    it('Purchase Return Book summarised: the count column shows returns per day, not bills', async () => {
        (getErpPurchaseReturnBook as jest.Mock).mockResolvedValue({
            format: 'summarised',
            summary: { ...summary, total_bill_amt: 262, bill_count: 0, return_count: 2 },
            rows: [{
                date: '2026-09-09', bill_count: 0, return_count: 2, bill_amt: 262, taxable: 250, tax: 12,
                tax_free: 0, exempted: 0, round_off: 0,
            }],
        });
        renderWithClient(<ErpPurchaseRegisterReport kind="purchase-return-book" />);

        // Default is detailed; switch to the daily view.
        const user = userEvent.setup();
        await screen.findByText('2026-09-09');
        await user.click(screen.getByRole('button', { name: 'summarised' }));
        expect(await screen.findByRole('columnheader', { name: 'Returns' })).toBeInTheDocument();
        const cell = screen.getByText('2026-09-09').closest('tr') as HTMLElement;
        expect(within(cell).getByText('2')).toBeInTheDocument();
        expect(within(cell).queryByText('0')).not.toBeInTheDocument();
    });

    it('does not flash the empty state while the outlet is still unknown (query disabled)', () => {
        (require('../hooks/useOutletId').useOutletId as jest.Mock).mockReturnValue('');
        renderWithClient(<ErpPurchaseRegisterReport kind="purchase-book" />);
        expect(screen.queryByText('No Purchase Records Found')).not.toBeInTheDocument();
        expect(getErpPurchaseBook).not.toHaveBeenCalled();
    });

    it('shows an empty state when there are no rows', async () => {
        (getErpPurchaseBook as jest.Mock).mockResolvedValue({ format: 'detailed', summary, rows: [] });
        renderWithClient(<ErpPurchaseRegisterReport kind="purchase-book" />);
        await waitFor(() => expect(screen.getByText('No Purchase Records Found')).toBeInTheDocument());
    });
});

describe('Reports dashboard', () => {
    it('lists the three purchase reports as cards that link to their own pages', () => {
        render(<ReportsCenterPage />);

        expect(screen.getByRole('heading', { name: 'Purchases' })).toBeInTheDocument();
        const expected: Record<string, string> = {
            'Purchase Book': '/dashboard/reports/purchase-book',
            'Consolidated Purchase Book': '/dashboard/reports/consolidated-purchase-book',
            'Purchase Return Book': '/dashboard/reports/purchase-return-book',
        };
        for (const [title, href] of Object.entries(expected)) {
            const card = screen.getByRole('heading', { name: title }).closest('a');
            expect(card).toHaveAttribute('href', href);
        }
        // Existing sales cards are untouched.
        expect(screen.getByRole('heading', { name: 'Sales Return Book' }).closest('a'))
            .toHaveAttribute('href', '/dashboard/reports/erp-sales-return-book');
    });
});
