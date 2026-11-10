import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const replace = jest.fn();
const push = jest.fn();
let searchString = '';
jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push }),
    usePathname: () => '/dashboard/purchases',
    useSearchParams: () => new URLSearchParams(searchString),
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/hooks/usePurchases', () => ({
    useDistributorList: () => ({ data: [{ id: 'd1', name: 'Sai Pharma' }], isLoading: false }),
    useDistributors: () => ({ data: [{ id: 'd1', name: 'Sai Pharma' }] }),
}));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({}) }));
jest.mock('@/components/inventory/ProductSearchDropdown', () => ({ ProductSearchDropdown: () => <div data-testid="product-search" /> }));
jest.mock('@/components/ui/date-range-picker', () => ({ DatePickerWithRange: () => <div /> }));

import { useAuthStore } from '@/store/authStore';
import { poApi, PoApiError } from '@/lib/poApi';
import { POStatusBadge } from '../po/POStatusBadge';
import { PurchaseOrdersList } from '../PurchaseOrdersList';
import { PODetailView } from '../PODetailView';
import { ShortbookTab } from '../ShortbookTab';

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const grant = (...p: string[]) => useAuthStore.setState({ user: { id: 'u1', role: 'admin', permissions: p, outlet: { id: 'o1' } } as never });

const calls: { url: string; init?: RequestInit }[] = [];
const respond = (router: (url: string, init?: RequestInit) => { status?: number; json?: unknown }) => {
    (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const r = router(url, init);
        return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json ?? {} } as Response;
    });
};
beforeEach(() => { calls.length = 0; replace.mockReset(); push.mockReset(); searchString = ''; grant('view_purchases', 'create_purchases', 'send_purchase_orders', 'cancel_purchase_orders'); });

const SUMMARY = (o: Record<string, unknown> = {}) => ({ id: 'po1', poNumber: 'PO-1', status: 'SENT', statusLabel: 'Sent', distributorId: 'd1', distributorName: 'Sai Pharma', orderDate: '2026-11-07',
    expectedDate: null, sentAt: null, sentVia: 'whatsapp_link', overdue: false, itemCount: 2, orderedQty: 10, receivedQty: 4, totalAmount: '500.00', closedShort: false, ...o });

describe('API layer', () => {
    it('surfaces the server sentence, not a generic failure', async () => {
        respond(() => ({ status: 400, json: { detail: 'Pick a distributor before saving.', code: 'NO_DISTRIBUTOR' } }));
        await expect(poApi.create('o1', { distributorId: '', items: [] })).rejects.toMatchObject({ message: 'Pick a distributor before saving.', code: 'NO_DISTRIBUTOR', status: 400 });
    });
    it('turns a network failure into a readable message', async () => {
        (global as any).fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
        await expect(poApi.list('o1')).rejects.toBeInstanceOf(PoApiError);
    });
});

describe('status badge', () => {
    it('shows SAVED as Draft and every other status by name', () => {
        const { rerender } = render(<POStatusBadge status="SAVED" />);
        expect(screen.getByText('Draft')).toBeInTheDocument();
        for (const [s, label] of [['SENT', 'Sent'], ['PARTIAL', 'Partial'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'], ['EXPIRED', 'Expired']] as const) {
            rerender(<POStatusBadge status={s} />);
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });
});

describe('PO list', () => {
    const list = (rows = [SUMMARY()]) => respond((url) => (url.includes('/purchases/orders/') ? { json: { results: rows, pagination: { page: 1, pageSize: 25, totalPages: 1, totalRecords: rows.length },
        statusCounts: { OPEN: 3, SAVED: 1, SENT: 2, PARTIAL: 0, COMPLETED: 5, CANCELLED: 0, EXPIRED: 1, ALL: 9 }, totals: { count: rows.length, amount: '500.00' } } } : { json: {} }));

    it('shows chips with counts, real links, progress and totals; defaults to the open orders', async () => {
        list();
        wrap(<PurchaseOrdersList />);
        expect(await screen.findByRole('link', { name: 'PO-1' })).toHaveAttribute('href', '/dashboard/purchases/orders/po1');
        expect(screen.getByRole('button', { name: /Open\s*3/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /Expired\s*1/ })).toBeInTheDocument();
        expect(screen.getByText('4/10')).toBeInTheDocument();
        expect(screen.getByText(/₹500\.00/, { selector: 'b' })).toBeInTheDocument();
        expect(calls.some((c) => c.url.includes('status=OPEN') || !c.url.includes('status='))).toBe(true);
    });

    it('a status chip is kept in the URL', async () => {
        list();
        wrap(<PurchaseOrdersList />);
        fireEvent.click(await screen.findByRole('button', { name: /Sent\s*2/ }));
        expect(replace).toHaveBeenCalledWith(expect.stringContaining('status=SENT'), expect.anything());
    });

    it('the search box says what it searches', async () => {
        list();
        wrap(<PurchaseOrdersList />);
        expect(await screen.findByPlaceholderText('PO number or distributor')).toBeInTheDocument();
    });

    it('an empty list points at the Shortbook, not a report that does not exist', async () => {
        list([]);
        wrap(<PurchaseOrdersList />);
        expect(await screen.findByText(/Start from the Shortbook/)).toBeInTheDocument();
        expect(screen.queryByText(/Reorder Planning/)).not.toBeInTheDocument();
    });
});

describe('PO detail (new draft)', () => {
    it('refuses to save with no distributor or lines and says why', async () => {
        searchString = '';
        wrap(<PODetailView orderId="new" />);
        fireEvent.click(screen.getAllByRole('button', { name: /Save draft/ })[0]);
        expect(await screen.findByRole('alert')).toHaveTextContent('Pick a distributor before saving.');
        expect(calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0);              // nothing was sent
    });

    it('with a distributor but no lines it asks for an item', async () => {
        searchString = 'distributorId=d1';
        wrap(<PODetailView orderId="new" />);
        fireEvent.click(screen.getAllByRole('button', { name: /Save draft/ })[0]);
        expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one item before saving.');
    });
});

describe('PO detail (saved order)', () => {
    const detail = (status: string, allowed: string[], extra: Record<string, unknown> = {}) => ({
        ...SUMMARY({ status, statusLabel: status }), version: 3, notes: '', cancelReason: '', expiresAt: null, distributorPhone: '9876543210', distributorEmail: '', distributorLedger: null, shareToken: null,
        allowedActions: allowed, sendDefaults: { channel: 'whatsapp_link', template: '', expiryDays: 3, storeName: 'Demo' },
        items: [{ id: 'l1', productId: 'p1', productName: 'Paracetamol', packLabel: '10 strip', qty: 10, receivedQty: 4, remainingQty: 6, estRate: '50.00', lineTotal: '500.00', currentStock: 2, minQty: 12, onOrder: 6, lastPurchaseRate: '48.00', shortbookItemId: null }],
        events: [{ id: 'e1', action: 'sent', userName: 'Pratik', at: '2026-11-07T10:00:00', payload: { channel: 'whatsapp_link' } }], ...extra });

    it('a Partial order is read-only and offers only what the server allows', async () => {
        respond(() => ({ json: detail('PARTIAL', ['receive', 'close_short', 'duplicate']) }));
        wrap(<PODetailView orderId="po1" />);
        expect(await screen.findByText(/so its lines are locked/)).toBeInTheDocument();
        expect(screen.getAllByText('Receive goods').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /Close short/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Save draft/ })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();                 // no editable quantity
        expect(screen.getByText(/Sent \(WhatsApp link\)/)).toBeInTheDocument();             // timeline
    });

    it('Receive goods goes to the purchase form with the PO id', async () => {
        respond(() => ({ json: detail('SENT', ['receive', 'resend', 'cancel', 'duplicate']) }));
        wrap(<PODetailView orderId="po1" />);
        fireEvent.click((await screen.findAllByText('Receive goods'))[0]);
        expect(push).toHaveBeenCalledWith('/dashboard/purchases?tab=new&poId=po1');
    });

    it('a Draft shows steppers and flags a zero quantity inline', async () => {
        respond(() => ({ json: detail('SAVED', ['edit', 'send', 'delete', 'duplicate'], { items: [{ id: 'l1', productId: 'p1', productName: 'Paracetamol', packLabel: '10 strip', qty: 10, receivedQty: 0, remainingQty: 10, estRate: '50.00', lineTotal: '500.00', currentStock: 2, minQty: 12, onOrder: 0, lastPurchaseRate: null, shortbookItemId: null }] }) }));
        wrap(<PODetailView orderId="po1" />);
        const qty = (await screen.findAllByLabelText('Quantity'))[0];
        fireEvent.change(qty, { target: { value: '0' } });
        fireEvent.click(screen.getAllByRole('button', { name: /Save draft/ })[0]);
        expect((await screen.findAllByText('Quantity must be at least 1')).length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByLabelText('Increase quantity')[0]);
        expect((qty as HTMLInputElement).value).toBe('1');
    });

    it('a stale save shows the server message with a Reload button', async () => {
        respond((url, init) => (init?.method === 'PUT'
            ? { status: 409, json: { detail: 'This PO was changed by someone else. Reload it and try again.', code: 'STALE' } }
            : { json: detail('SAVED', ['edit', 'send', 'delete', 'duplicate']) }));
        wrap(<PODetailView orderId="po1" />);
        fireEvent.change((await screen.findAllByLabelText('Quantity'))[0], { target: { value: '7' } });
        fireEvent.click(screen.getAllByRole('button', { name: /Save draft/ })[0]);
        expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else');
        expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    });
});

describe('Shortbook (groups, loaded a page at a time)', () => {
    const row = (id: string, name: string, dist: string | null, status = 'PENDING') => ({ id, productId: 'p' + id, productName: name, packLabel: '10 strip', qtyNeeded: 5, source: 'low_stock', sourceLabel: 'Low stock', status, statusLabel: status,
        note: '', customerName: '', customerPhone: '', distributorId: dist, distributorName: dist ? (dist === 'd1' ? 'Sai Pharma' : 'Gupta Agency') : null, currentStock: 1, minQty: 10, onOrder: 0, lastRate: '40.00', addedOn: '2026-11-07T09:00:00' });
    const group = (key: string, name: string, items: number, pending = items) => ({ key, distributorId: key === 'none' ? null : key, name, items, pending, qty: items * 5 });
    const pageInfo = (page: number, pageSize: number, totalRecords: number) => ({ page, pageSize, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)) });
    const counts = { pending: 35, inDraft: 0, ordered: 0 };

    /** a Shortbook of three groups: Sai (30 items, two pages), Gupta (3), and 2 that still need a distributor */
    const shortbookApi = (over: { groups?: unknown[]; onCreate?: (b: any) => { status?: number; json?: unknown } } = {}) => respond((url, init) => {
        if (url.includes('create-pos')) return over.onCreate ? over.onCreate(JSON.parse(String(init?.body))) : { status: 201, json: { created: [{ id: 'new1', poNumber: 'PO-9', distributorName: 'Sai Pharma', itemCount: 30, totalAmount: '400.00' }] } };
        if (url.includes('view=groups')) return { json: { groups: over.groups ?? [group('none', 'No distributor chosen', 2), group('d1', 'Sai Pharma', 30), group('d2', 'Gupta Agency', 3)], pagination: pageInfo(1, 10, 3), counts } };
        const m = url.match(/distributorId=([^&]+)/);
        if (m) {
            const page = Number((url.match(/[?&]page=(\d+)/) || [])[1] || 1);
            const key = m[1];
            if (key === 'd1') { const from = (page - 1) * 25; const n = page === 1 ? 25 : 5; return { json: { results: Array.from({ length: n }, (_, i) => row(`a${from + i}`, `Sai Item ${String(from + i).padStart(2, '0')}`, 'd1')), pagination: pageInfo(page, 25, 30), counts } }; }
            if (key === 'd2') return { json: { results: [row('b1', 'Gupta One', 'd2'), row('b2', 'Gupta Two', 'd2'), row('b3', 'Gupta Three', 'd2')], pagination: pageInfo(1, 25, 3), counts } };
            return { json: { results: [row('n1', 'Insulin', null), row('n2', 'Vaccine', null)], pagination: pageInfo(1, 25, 2), counts } };
        }
        return { json: { results: [], counts } };
    });
    const itemCalls = () => calls.filter((c) => /distributorId=/.test(c.url) && !c.url.includes('create-pos'));

    it('loads only the group list first, then ONE group (the first), a page at a time', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        expect(await screen.findByText('No distributor chosen')).toBeInTheDocument();
        expect(screen.getByText('Sai Pharma')).toBeInTheDocument();
        expect(screen.getByText('Gupta Agency')).toBeInTheDocument();
        expect(await screen.findByText('Insulin')).toBeInTheDocument();                  // the first group is open
        expect(screen.queryByText('Sai Item 00')).not.toBeInTheDocument();              // the others are closed: their rows were never fetched
        expect(calls.filter((c) => c.url.includes('view=groups'))).toHaveLength(1);
        expect(itemCalls()).toHaveLength(1);
        expect(itemCalls()[0].url).toContain('distributorId=none');
        expect(screen.getByTestId('shortbook-counts')).toHaveTextContent('35 pending');
    });

    it('opening a group fetches just that group, 25 items, and closing it keeps the others untouched', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.click(screen.getByRole('button', { name: /Sai Pharma/ }));
        expect(await screen.findByText('Sai Item 00')).toBeInTheDocument();
        expect(screen.getByText('Sai Item 24')).toBeInTheDocument();
        expect(screen.queryByText('Sai Item 25')).not.toBeInTheDocument();               // page 2 is not loaded yet
        expect(itemCalls().map((c) => c.url.match(/distributorId=(\w+)/)![1])).toEqual(['none', 'd1']);
        expect(screen.queryByText('Gupta One')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Sai Pharma/ }));
        expect(screen.queryByText('Sai Item 00')).not.toBeInTheDocument();
    });

    it('a group with more than one page has its own pager that loads the next 25', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.click(screen.getByRole('button', { name: /Sai Pharma/ }));
        await screen.findByText('Sai Item 00');
        const pager = screen.getByRole('navigation', { name: 'item pages' });
        expect(pager).toHaveTextContent('1–25 of 30 items');
        fireEvent.click(within(pager).getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('Sai Item 25')).toBeInTheDocument();
        expect(screen.queryByText('Sai Item 00')).not.toBeInTheDocument();
        expect(itemCalls().some((c) => /distributorId=d1/.test(c.url) && /page=2/.test(c.url))).toBe(true);
        expect(screen.getByRole('navigation', { name: 'item pages' })).toHaveTextContent('26–30 of 30 items');
    });

    it('many groups are paged too, and changing the page asks the server for that page of groups', async () => {
        respond((url) => (url.includes('view=groups')
            ? { json: { groups: Array.from({ length: 10 }, (_, i) => group(`g${i}`, `Dist ${i}`, 2)), pagination: pageInfo(Number((url.match(/[?&]page=(\d+)/) || [])[1] || 1), 10, 23), counts } }
            : { json: { results: [], pagination: pageInfo(1, 25, 0), counts } }));
        wrap(<ShortbookTab />);
        await screen.findByText('Dist 0');
        const pager = screen.getByRole('navigation', { name: 'group pages' });
        expect(pager).toHaveTextContent('1–10 of 23 groups');
        fireEvent.click(within(pager).getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(calls.some((c) => c.url.includes('view=groups') && /page=2/.test(c.url))).toBe(true));
    });

    it('ticking a single item shows the bar and Create POs sends exactly that id', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.click(screen.getByRole('button', { name: /Gupta Agency/ }));
        fireEvent.click(await screen.findByLabelText('Select Gupta Two'));
        const bar = await screen.findByTestId('shortbook-bar');
        expect(bar).toHaveTextContent('1 items');
        expect(bar).toHaveTextContent('1 distributor');
        fireEvent.click(screen.getByRole('button', { name: 'Create POs' }));
        await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/purchases/orders/new1'));
        expect(JSON.parse(String(calls.find((c) => c.url.includes('create-pos'))!.init?.body))).toMatchObject({ itemIds: ['b2'], distributorIds: [] });
    });

    it('"select all" on a group covers every page: the bar counts all 30 and only the distributor id is sent', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.click(screen.getByLabelText('Select all for Sai Pharma'));           // collapsed group, nothing of it is loaded
        const bar = await screen.findByTestId('shortbook-bar');
        expect(bar).toHaveTextContent('30 items');
        expect(bar).toHaveTextContent('1 distributor');
        expect(screen.getByText('All 30 pending selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create POs' }));
        await waitFor(() => expect(push).toHaveBeenCalled());
        expect(JSON.parse(String(calls.find((c) => c.url.includes('create-pos'))!.init?.body))).toMatchObject({ itemIds: [], distributorIds: ['d1'] });
    });

    it('rows of a fully selected group show ticked and locked; unticking the group frees them', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.click(screen.getByRole('button', { name: /Sai Pharma/ }));
        await screen.findByText('Sai Item 00');
        fireEvent.click(screen.getByLabelText('Select all for Sai Pharma'));
        expect(screen.getByLabelText('Select Sai Item 00')).toBeChecked();
        expect(screen.getByLabelText('Select Sai Item 00')).toBeDisabled();
        fireEvent.click(screen.getByLabelText('Select all for Sai Pharma'));
        expect(screen.getByLabelText('Select Sai Item 00')).not.toBeChecked();
        expect(screen.getByLabelText('Select Sai Item 00')).toBeEnabled();
        expect(screen.queryByTestId('shortbook-bar')).not.toBeInTheDocument();
    });

    it('a group and single items from another group can be mixed, and Clear empties the selection', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.click(screen.getByLabelText('Select all for Sai Pharma'));
        fireEvent.click(screen.getByRole('button', { name: /Gupta Agency/ }));
        fireEvent.click(await screen.findByLabelText('Select Gupta One'));
        const bar = await screen.findByTestId('shortbook-bar');
        expect(bar).toHaveTextContent('31 items');
        expect(bar).toHaveTextContent('2 distributors');
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(screen.queryByTestId('shortbook-bar')).not.toBeInTheDocument();
    });

    it('the group that has no distributor cannot be ordered as a whole, and a server refusal is shown', async () => {
        shortbookApi({ onCreate: () => ({ status: 400, json: { detail: 'Choose a distributor for: Insulin', code: 'NO_DISTRIBUTOR' } }) });
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        expect(screen.queryByLabelText('Select all for No distributor chosen')).not.toBeInTheDocument();
        fireEvent.click(await screen.findByLabelText('Select Insulin'));
        fireEvent.click(screen.getByRole('button', { name: 'Create POs' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Choose a distributor for: Insulin');
    });

    it('a new search starts again from page one of the groups with the first group open', async () => {
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        fireEvent.change(screen.getByLabelText('Search the Shortbook'), { target: { value: 'ins' } });
        await waitFor(() => expect(calls.some((c) => c.url.includes('view=groups') && c.url.includes('search=ins') && /page=1/.test(c.url))).toBe(true));
        await waitFor(() => expect(itemCalls().some((c) => c.url.includes('search=ins'))).toBe(true));      // the open group re-fetched with the filter
    });

    it('an empty Shortbook says what to do instead of showing nothing', async () => {
        shortbookApi({ groups: [] });
        wrap(<ShortbookTab />);
        expect(await screen.findByText('Nothing to order')).toBeInTheDocument();
    });

    it('without a purchase right there are no checkboxes or Create POs', async () => {
        grant('view_purchases');
        shortbookApi();
        wrap(<ShortbookTab />);
        await screen.findByText('Insulin');
        expect(screen.queryByLabelText('Select Insulin')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Select all for Sai Pharma')).not.toBeInTheDocument();
        expect(screen.queryByTestId('shortbook-bar')).not.toBeInTheDocument();
    });
});
