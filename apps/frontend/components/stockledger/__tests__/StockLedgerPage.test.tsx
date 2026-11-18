import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockLedgerPage from '@/app/dashboard/stockledger/page';
import { fetchLedgerHealth, fetchLedgerPage, fetchLedgerProduct, fetchLedgerProducts, repairLedger } from '@/lib/stockLedgerApi';

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
            const s = R.useSyncExternalStore((cb: () => void) => { mockListeners.add(cb); return () => mockListeners.delete(cb); }, () => mockSearch, () => mockSearch);
            return new URLSearchParams(s);
        },
    };
});
const mockToast = jest.fn();
let mockManager = true;
let mockCanSell = true;
let mockCanPurchases = true;
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: (p: string) => (p === 'adjust_stock' ? mockManager : p === 'create_bills' ? mockCanSell : p === 'view_purchases' ? mockCanPurchases : true) }) }));
jest.mock('@/components/stockledger/InvoiceViewer', () => ({ InvoiceViewer: ({ target, onClose }: any) => <div role="dialog" aria-label="invoice viewer">VIEWING {target.kind} {target.id}<button onClick={onClose}>close viewer</button></div> }));
jest.mock('@/lib/stockLedgerApi', () => ({
    fetchLedgerPage: jest.fn(), fetchLedgerProducts: jest.fn(), fetchLedgerProduct: jest.fn(), fetchLedgerHealth: jest.fn(), repairLedger: jest.fn(), downloadLedgerExport: jest.fn(),
}));

const ledgerMock = fetchLedgerPage as jest.Mock;
const productsMock = fetchLedgerProducts as jest.Mock;
const productMock = fetchLedgerProduct as jest.Mock;
const healthMock = fetchLedgerHealth as jest.Mock;
const repairMock = repairLedger as jest.Mock;

const PACK = { pack_size: 10, pack_type: 'strip', pack_unit: 'tablet' };
const entry = (over: Record<string, unknown> = {}) => ({
    id: 'e1', batch_id: 'b1', product_id: 'p1', txn_date: '2026-11-05', txn_type: 'SALE_OUT', txn_type_label: 'Sold', event: 'sold', event_label: 'Sold',
    detail: 'Sale Invoice INV-0001', counterparty: 'Ramesh', voucher_type: 'Sale Invoice', voucher_number: 'INV-0001', party_name: 'Ramesh', product_name: 'Dolo 650',
    batch_number: 'B123', expiry_date: '2027-06-30', ...PACK, qty_in: 0, qty_out: 2, qty: -2, running_qty: 8, balance_negative: false,
    rate: null, value_in: null, value_out: null, running_value: null, created_at: '2026-11-05T10:30:00', ...over,
});
const card = (over: Record<string, unknown> = {}) => ({
    id: 'b1', batch_number: 'B123', product_id: 'p1', product_name: 'Dolo 650', manufacturer: 'Micro Labs', expiry_date: '2027-06-30', days_to_expiry: 200,
    qty_strips: 8, qty_loose: 0, qty_units: 80, qty_packs: 8, ...PACK, mrp: 30, rack_location: 'A1', state: 'ok',
    supplier: { distributor_id: 'd1', distributor_name: 'Alpha Agencies', invoice_id: 'i1', invoice_no: 'PINV-7', invoice_date: '2026-10-01', more_suppliers: false },
    ledger_state: 'OK', ledger_state_label: 'Ledger matches stock', ...over,
});
const page = (over: Record<string, unknown> = {}) => ({
    entries: [entry()],
    summary: { total_in: 120, total_out: 40, received: 120, sold: 40, customer_returns: 0, written_off: 0, supplier_returns: 0, added: 0, total_value_in: null, total_value_out: null },
    batch: null, totalRecords: 1, totalPages: 1, ...over,
});
const product = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Dolo 650', manufacturer: 'Micro Labs', batch_count: 2, stocked_batches: 1,
    batches: [card(), card({ id: 'b2', batch_number: 'B999', state: 'sold_out', qty_units: 0, qty_packs: 0, days_to_expiry: 40, expiry_date: '2026-12-27' })], ...over,
});
const health = (over: Record<string, unknown> = {}) => ({
    counts: { OK: 10, A: 3, B: 1, B2: 0, C: 2, R: 0 }, labels: { OK: 'Ledger matches stock', A: 'No ledger history (opening balance missing)', B: 'History starts without an opening balance', B2: 'x', C: 'Ledger total differs from the batch stock', R: 'r' },
    safeToRepair: 4, needsDecision: 2, openingStockIfBookedAsOpening: 1500, canRepair: true, ...over,
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
        mockManager = true;
        mockCanSell = true;
        mockCanPurchases = true;
        setUrl('from=2026-11-01&to=2026-11-10');
        ledgerMock.mockResolvedValue(page());
        productsMock.mockResolvedValue([product()]);
        productMock.mockResolvedValue(product());
        healthMock.mockResolvedValue(health({ safeToRepair: 0, needsDecision: 0, counts: { OK: 10, A: 0, B: 0, B2: 0, C: 0, R: 0 } }));
    });

    it('labels the controls and says each movement in plain words, with who and which invoice', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { level: 1, name: 'Stock Ledger' })).toBeInTheDocument();
        for (const name of ['From', 'To', 'Invoice, customer or supplier', 'Product or batch number']) expect(screen.getByLabelText(name)).toBeInTheDocument();
        const table = await screen.findByRole('table');
        expect(within(table).getByText('Sold')).toBeInTheDocument();
        expect(within(table).getByText('Ramesh · Sale Invoice INV-0001')).toBeInTheDocument();
        expect(within(table).getByText('−2 strips')).toBeInTheDocument();           // the batch's own words, one signed quantity
        expect(within(table).queryByRole('columnheader', { name: /voucher|party|rate/i })).not.toBeInTheDocument();
    });

    it('fills in the default dates in the URL without breaking the first load', async () => {
        setUrl(''); mockSearch = '';
        renderPage();
        await waitFor(() => expect(mockSearch).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/));
        await waitFor(() => expect(ledgerMock).toHaveBeenCalled());
    });

    it('one tap sets a quick range', async () => {
        renderPage();
        await screen.findByRole('table');
        await userEvent.click(screen.getByRole('button', { name: '7 days' }));
        expect(mockSearch).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
        const [from, to] = [/from=([\d-]+)/, /to=([\d-]+)/].map((r) => mockSearch.match(r)![1]);
        expect((Date.parse(to) - Date.parse(from)) / 86400000).toBe(7);
    });

    it('the summary counts what moved in packs and never shows money unless asked and allowed', async () => {
        renderPage();
        const summary = await screen.findByRole('group', { name: /summary for the selected period/i }).catch(() => screen.findByLabelText(/summary for the selected period/i));
        expect(within(summary).getByText('120 packs')).toBeInTheDocument();
        expect(within(summary).getByText('40 packs')).toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: /show money values/i })).not.toBeInTheDocument();     // no rates: nothing to show
        expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
    });

    it('people allowed to see rates can turn money on, and it stays off by default', async () => {
        ledgerMock.mockResolvedValue(page({
            entries: [entry({ rate: 30, value_in: 0, value_out: 60, running_value: 240 })],
            summary: { total_in: 120, total_out: 40, received: 120, sold: 40, customer_returns: 0, written_off: 0, supplier_returns: 0, added: 0, total_value_in: 3600, total_value_out: 1200 },
        }));
        renderPage();
        const sw = await screen.findByRole('switch', { name: /show money values/i });
        expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
        await userEvent.click(sw);
        expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0);
    });

    it('fetches once per filter change, on page 1', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&page=3');
        ledgerMock.mockResolvedValue(page({ totalRecords: 300, totalPages: 6 }));
        renderPage();
        await waitFor(() => expect(ledgerMock).toHaveBeenCalledTimes(1));
        expect(ledgerMock.mock.calls[0][0].page).toBe(3);
        await userEvent.type(screen.getByLabelText('Invoice, customer or supplier'), 'dolo');
        await waitFor(() => expect(ledgerMock.mock.calls.some((c) => c[0].q === 'dolo')).toBe(true));
        const withSearch = ledgerMock.mock.calls.filter((c) => c[0].q === 'dolo');
        expect(withSearch).toHaveLength(1);
        expect(withSearch[0][0].page).toBe(1);
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
        expect(await screen.findByText(/couldn.t load the ledger/i)).toBeInTheDocument();
        expect(screen.getByText(/Server exploded/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('table')).toBeInTheDocument();
    });

    it('product first: type, pick a product, see its batches as cards, pick one, see its card with the supplier', async () => {
        renderPage();
        await screen.findByRole('table');
        await userEvent.type(screen.getByLabelText('Product or batch number'), 'dolo');
        await userEvent.click(await screen.findByRole('option', { name: /dolo 650/i }));
        expect(mockSearch).toContain('product=p1');
        await waitFor(() => expect(ledgerMock.mock.calls.some((c) => c[0].product === 'p1' && !c[0].batch)).toBe(true));
        const strip = await screen.findByRole('region', { name: 'Batches of Dolo 650' });
        expect(within(strip).getByText('B123')).toBeInTheDocument();
        expect(within(strip).getByText('Sold out')).toBeInTheDocument();
        ledgerMock.mockResolvedValue(page({ batch: card() }));
        await userEvent.click(within(strip).getByRole('button', { name: /B123/ }));
        expect(mockSearch).toContain('batch=b1');
        const panel = await screen.findByRole('region', { name: 'Batch B123' });
        expect(within(panel).getByText(/Alpha Agencies/)).toBeInTheDocument();
        expect(within(panel).getByText(/PINV-7/)).toBeInTheDocument();
        expect(within(panel).getByText('8 strips')).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: /product and batch/i })).not.toBeInTheDocument();      // one batch: not repeated on every row
    });

    it('a product whose batches share one pack is summarised in that pack\'s words, not "packs"', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&product=p1');
        ledgerMock.mockResolvedValue(page({ summary: { total_in: 0, total_out: 2, received: 0, sold: 2, customer_returns: 0, written_off: 0, supplier_returns: 0, added: 0, total_value_in: null, total_value_out: null } }));
        renderPage();
        const summary = await screen.findByLabelText(/summary for the selected period/i);
        expect(within(summary).getByText('2 strips')).toBeInTheDocument();
    });

    it('opening a link with only a product id loads its batches', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&product=p1');
        renderPage();
        expect(await screen.findByRole('region', { name: 'Batches of Dolo 650' })).toBeInTheDocument();
        expect(productMock).toHaveBeenCalledWith('o1', 'p1', expect.anything());
    });

    it('an old link with only a batch still shows the batch card and hides the product column', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&batch=b1');
        ledgerMock.mockResolvedValue(page({ batch: card() }));
        renderPage();
        expect(await screen.findByRole('region', { name: 'Batch B123' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: /product and batch/i })).not.toBeInTheDocument();
    });

    it('a negative balance is flagged, with the reason, instead of looking like a billing mistake', async () => {
        ledgerMock.mockResolvedValue(page({ entries: [entry({ running_qty: -0.6, balance_negative: true })] }));
        renderPage();
        const table = await screen.findByRole('table');
        expect(within(table).getByLabelText('History incomplete')).toBeInTheDocument();
        expect(within(table).getByText(/−6 tablets/)).toBeInTheDocument();
    });

    describe('opening the invoice a movement came from', () => {
        const saleRow = () => entry({ source: { kind: 'sale', id: 'sale-1' }, detail: 'Sale Invoice INV-0001' });

        it('the invoice reference is a link that opens the sale in a preview, and closing it returns to the list', async () => {
            ledgerMock.mockResolvedValue(page({ entries: [saleRow()] }));
            renderPage();
            const table = await screen.findByRole('table');
            await userEvent.click(within(table).getByRole('button', { name: 'Open sale invoice: Sale Invoice INV-0001' }));
            expect(await screen.findByRole('dialog', { name: 'invoice viewer' })).toHaveTextContent('VIEWING sale sale-1');
            await userEvent.click(screen.getByText('close viewer'));
            expect(screen.queryByRole('dialog', { name: 'invoice viewer' })).not.toBeInTheDocument();
        });

        it('a purchase row opens the purchase invoice', async () => {
            ledgerMock.mockResolvedValue(page({ entries: [entry({ event: 'received', event_label: 'Received', counterparty: 'Alpha Agencies', detail: 'Purchase Invoice PINV-7', source: { kind: 'purchase', id: 'inv-9' } })] }));
            renderPage();
            const table = await screen.findByRole('table');
            await userEvent.click(within(table).getByRole('button', { name: 'Open purchase invoice: Purchase Invoice PINV-7' }));
            expect(await screen.findByRole('dialog', { name: 'invoice viewer' })).toHaveTextContent('VIEWING purchase inv-9');
        });

        it('keeps the customer as text next to the link', async () => {
            ledgerMock.mockResolvedValue(page({ entries: [saleRow()] }));
            renderPage();
            const table = await screen.findByRole('table');
            expect(within(table).getByText('Ramesh')).toBeInTheDocument();
        });

        it('rows with no document (opening stock, write-offs) have no link', async () => {
            ledgerMock.mockResolvedValue(page({ entries: [entry({ event: 'written_off', event_label: 'Written off: Expired', detail: 'Expiry write-off', counterparty: '', source: null })] }));
            renderPage();
            const table = await screen.findByRole('table');
            expect(within(table).getByText('Expiry write-off')).toBeInTheDocument();
            expect(within(table).queryByRole('button', { name: /open .* invoice/i })).not.toBeInTheDocument();
        });

        it('a sale or purchase return is not previewed here (no link)', async () => {
            ledgerMock.mockResolvedValue(page({ entries: [entry({ event: 'customer_return', event_label: 'Customer return', detail: 'x', source: { kind: 'sale_return', id: 'r1' } })] }));
            renderPage();
            const table = await screen.findByRole('table');
            expect(within(table).queryByRole('button', { name: /open .* invoice/i })).not.toBeInTheDocument();
        });

        it('a person who may not open sales gets no sale link, but keeps the purchase link if allowed', async () => {
            mockCanSell = false;
            ledgerMock.mockResolvedValue(page({ entries: [saleRow(), entry({ id: 'e2', event: 'received', event_label: 'Received', detail: 'Purchase Invoice PINV-7', counterparty: 'Alpha', source: { kind: 'purchase', id: 'inv-9' } })] }));
            renderPage();
            const table = await screen.findByRole('table');
            expect(within(table).queryByRole('button', { name: /sale invoice/i })).not.toBeInTheDocument();
            expect(within(table).getByText('Ramesh · Sale Invoice INV-0001')).toBeInTheDocument();       // still readable, just not a link
            expect(within(table).getByRole('button', { name: /purchase invoice/i })).toBeInTheDocument();
        });

        it('the supplier line of a batch card opens its purchase invoice', async () => {
            setUrl('from=2026-11-01&to=2026-11-10&batch=b1');
            ledgerMock.mockResolvedValue(page({ batch: card() }));
            renderPage();
            const panel = await screen.findByRole('region', { name: 'Batch B123' });
            await userEvent.click(within(panel).getByRole('button', { name: 'invoice PINV-7' }));
            expect(await screen.findByRole('dialog', { name: 'invoice viewer' })).toHaveTextContent('VIEWING purchase i1');
        });
    });

    it('a bookkeeping row says stock did not change', async () => {
        ledgerMock.mockResolvedValue(page({ entries: [entry({ event: 'bookkeeping', event_label: 'Opening balance recorded', detail: 'Added when this batch\'s history was found empty. Stock did not change.', counterparty: '', qty: 5, qty_in: 5, qty_out: 0 })] }));
        renderPage();
        const table = await screen.findByRole('table');
        expect(within(table).getByText('Opening balance recorded')).toBeInTheDocument();
        expect(within(table).getByText(/Stock did not change/)).toBeInTheDocument();
    });

    it('says why the list is empty and offers a way out when filters are on', async () => {
        setUrl('from=2026-11-01&to=2026-11-10&q=zzz');
        ledgerMock.mockResolvedValue(page({ entries: [], totalRecords: 0 }));
        renderPage();
        expect(await screen.findByText('No movements match your filters')).toBeInTheDocument();
        await act(async () => { await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]); });
        await waitFor(() => expect(mockSearch).not.toContain('q='));
    });

    describe('ledger health', () => {
        beforeEach(() => healthMock.mockResolvedValue(health()));

        it('a manager is told about batches with an incomplete history', async () => {
            renderPage();
            expect(await screen.findByText(/6 batches have an incomplete history/)).toBeInTheDocument();
            expect(screen.getByText(/Your stock itself is not affected/)).toBeInTheDocument();
        });

        it('nobody below manager sees it, and the endpoint is not even asked', async () => {
            mockManager = false;
            renderPage();
            await screen.findByRole('table');
            expect(screen.queryByText(/incomplete history/)).not.toBeInTheDocument();
            expect(healthMock).not.toHaveBeenCalled();
        });

        it('the dialog says what is safe, what needs a decision, and that no profit figure moves', async () => {
            renderPage();
            await userEvent.click(await screen.findByRole('button', { name: 'See what can be done' }));
            const dialog = await screen.findByRole('dialog', { name: 'Incomplete stock history' });
            expect(within(dialog).getAllByText('can be repaired')).toHaveLength(2);        // A and B
            expect(within(dialog).getByText('needs a decision')).toBeInTheDocument();      // C
            expect(within(dialog).getByText(/changes no stock and no profit figure/)).toBeInTheDocument();
            expect(within(dialog).getByText(/₹1,500/)).toBeInTheDocument();
        });

        it('an admin repairs with their own password; the list then refreshes', async () => {
            repairMock.mockResolvedValue({ repaired: { A: 3, B: 1 }, total: 4 });
            renderPage();
            await userEvent.click(await screen.findByRole('button', { name: 'See what can be done' }));
            const dialog = await screen.findByRole('dialog');
            const go = within(dialog).getByRole('button', { name: /Add the missing opening balances \(4\)/ });
            expect(go).toBeDisabled();
            await userEvent.type(within(dialog).getByLabelText(/Your password/), 'MyPass#1');
            const before = ledgerMock.mock.calls.length;
            await userEvent.click(go);
            await waitFor(() => expect(repairMock).toHaveBeenCalledWith('o1', 'MyPass#1'));
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '4 batches repaired' }));
            await waitFor(() => expect(ledgerMock.mock.calls.length).toBeGreaterThan(before));
        });

        it('a wrong password is said plainly, clears the box and keeps the dialog open', async () => {
            repairMock.mockRejectedValue({ error: { code: 'WRONG_PASSWORD', message: 'Wrong password' } });
            renderPage();
            await userEvent.click(await screen.findByRole('button', { name: 'See what can be done' }));
            const dialog = await screen.findByRole('dialog');
            await userEvent.type(within(dialog).getByLabelText(/Your password/), 'nope');
            await userEvent.click(within(dialog).getByRole('button', { name: /Add the missing opening balances/ }));
            expect(await within(dialog).findByText('Wrong password')).toBeInTheDocument();
            expect(within(dialog).getByLabelText(/Your password/)).toHaveValue('');
        });

        it('a manager who is not an admin is told to ask one', async () => {
            healthMock.mockResolvedValue(health({ canRepair: false }));
            renderPage();
            await userEvent.click(await screen.findByRole('button', { name: 'See what can be done' }));
            const dialog = await screen.findByRole('dialog');
            expect(within(dialog).getByText(/Only an admin can do this/)).toBeInTheDocument();
            expect(within(dialog).queryByLabelText(/Your password/)).not.toBeInTheDocument();
        });
    });
});
