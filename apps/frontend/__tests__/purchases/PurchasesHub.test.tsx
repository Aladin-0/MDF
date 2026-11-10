import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const replace = jest.fn();
let params = new URLSearchParams('');
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace }),
    usePathname: () => '/dashboard/purchases',
    useSearchParams: () => params,
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (...a: unknown[]) => mockToast(...a) }), toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/hooks/usePO', () => ({
    useShortbook: () => ({ data: { counts: { pending: 4, inDraft: 0, ordered: 0 }, results: [] } }),
    usePOList: () => ({ data: { statusCounts: { OPEN: 18 }, results: [] } }),
    useInvalidatePO: () => jest.fn(),
}));
// the tab bodies are tested on their own; here only the page around them matters
jest.mock('@/components/purchases/PurchasesList', () => ({ PurchasesList: () => <div>invoices-body</div> }));
jest.mock('@/components/purchases/NewPurchaseForm', () => ({ NewPurchaseForm: () => <div>new-purchase-body</div> }));
jest.mock('@/components/purchases/DistributorsTab', () => ({ DistributorsTab: () => <div>distributors-body</div> }));
jest.mock('@/components/purchases/PurchaseOrdersList', () => ({ PurchaseOrdersList: () => <div>po-list-body</div> }));
jest.mock('@/components/purchases/ShortbookTab', () => ({ ShortbookTab: () => <div>shortbook-body</div>, AddToShortbook: ({ open }: any) => (open ? <div>add-shortbook-dialog</div> : null) }));
jest.mock('@/components/purchases/NewPurchaseOrderModal', () => ({ NewPurchaseOrderModal: ({ open }: any) => (open ? <div>new-po-dialog</div> : null) }));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({}), inventoryApi: { getStock: jest.fn() } }));

import PurchasesPage from '@/app/dashboard/purchases/page';
import { LowStockTable } from '@/components/inventory/LowStockTable';
import { inventoryApi } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { SHORTCUTS } from '@/config/shortcuts';

const grant = (...p: string[]) => useAuthStore.setState({ user: { id: 'u', role: 'admin', permissions: p, outlet: { id: 'o1' } } as never });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
beforeEach(() => { replace.mockReset(); mockToast.mockReset(); params = new URLSearchParams(''); grant('view_purchases', 'create_purchases', 'edit_purchases'); });

describe('Purchases page', () => {
    it('has the five tabs, opens on the Shortbook and has no PO Settings tab any more', () => {
        render(<PurchasesPage />);
        for (const name of [/^Shortbook/, /^Purchase Orders/, /^Invoices/, /^New Purchase/, /^Distributors/]) {
            expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
        }
        expect(screen.queryByRole('button', { name: /PO Settings/ })).not.toBeInTheDocument();
        expect(screen.getByText('shortbook-body')).toBeInTheDocument();
    });

    it('shows the pending Shortbook count and the open PO count on their tabs', () => {
        render(<PurchasesPage />);
        expect(screen.getByRole('button', { name: /Shortbook\s*4/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Purchase Orders\s*18/ })).toBeInTheDocument();
    });

    it('the main button follows the tab: Add to Shortbook, then New PO', () => {
        render(<PurchasesPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Add to Shortbook' })[0]);
        expect(screen.getByText('add-shortbook-dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Purchase Orders/ }));
        expect(screen.getByText('po-list-body')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New PO' }));
        expect(screen.getByText('new-po-dialog')).toBeInTheDocument();
    });

    it('without the create right there are no create buttons', () => {
        grant('view_purchases');
        render(<PurchasesPage />);
        expect(screen.queryByRole('button', { name: 'Add to Shortbook' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New PO' })).not.toBeInTheDocument();
    });

    it('deep links open the right tab (inventory reorder link, "Receive goods")', () => {
        params = new URLSearchParams('tab=purchase_orders&newPo=1');
        render(<PurchasesPage />);
        expect(screen.getByText('po-list-body')).toBeInTheDocument();
        expect(screen.getByText('new-po-dialog')).toBeInTheDocument();                  // the old link used to 404
    });

    it('?tab=new opens the purchase form (the PO "Receive goods" link)', () => {
        params = new URLSearchParams('tab=new&poId=po1');
        render(<PurchasesPage />);
        expect(screen.getByText('new-purchase-body')).toBeInTheDocument();
    });

    it('an old bookmark to the PO Settings tab is sent to Settings', () => {
        params = new URLSearchParams('tab=po_settings');
        render(<PurchasesPage />);
        expect(replace).toHaveBeenCalledWith('/dashboard/settings?tab=purchasing');
    });
});

describe('Settings shortcut', () => {
    it('Alt+G O U jumps to the Purchase Orders section of Settings', () => {
        const s = SHORTCUTS.find((x) => x.action.type === 'navigate' && (x.action as any).href === '/dashboard/settings?tab=purchasing');
        expect(s).toBeDefined();
    });
});

describe('Inventory low-stock list', () => {
    const row = { id: 'p1', name: 'Paracetamol 500mg', composition: 'Paracetamol', manufacturer: 'Cipla', minQty: 12, totalStock: 4, packType: 'strip', nearestExpiry: '2027-03-01' };
    const stock = () => (inventoryApi.getStock as jest.Mock).mockResolvedValue({ data: [row] });

    it('adds a short product to the Shortbook with the shortage as quantity, then marks it done', async () => {
        stock();
        const calls: { url: string; init?: RequestInit }[] = [];
        (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return { ok: true, status: 201, json: async () => ({ id: 's1' }) } as Response; });
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /Add to Shortbook/ }));
        const done = await screen.findByRole('button', { name: /In Shortbook/ });
        expect(done).toBeDisabled();                                                     // cannot be added twice by double click
        expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ productId: 'p1', qty: 8, source: 'low_stock' });   // 12 - 4
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Added to the Shortbook' }));
    });

    it('a failure is reported and the button stays usable', async () => {
        stock();
        (global as any).fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ detail: 'That product was not found.' }) } as Response));
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /Add to Shortbook/ }));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'That product was not found.' })));
        expect(screen.getByRole('button', { name: /Add to Shortbook/ })).toBeEnabled();
    });

    it('hides the ordering buttons from someone who cannot purchase', async () => {
        grant('view_inventory');
        stock();
        wrap(<LowStockTable onReorderClick={jest.fn()} />);
        await screen.findByText('Paracetamol 500mg');
        expect(screen.queryByRole('button', { name: /Add to Shortbook/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Create Purchase Order' })).not.toBeInTheDocument();
    });
});
