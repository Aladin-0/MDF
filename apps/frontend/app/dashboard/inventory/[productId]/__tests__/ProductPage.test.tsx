import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductInventoryPage from '../page';
import { inventoryApi } from '@/lib/apiClient';
import { toDayString } from '@/lib/dates';

const mockRouter = { back: jest.fn(), push: jest.fn() };
const mockToast = jest.fn();
let mockAllowed: string[] = [];
jest.mock('next/navigation', () => ({ useParams: () => ({ productId: 'p1' }), useRouter: () => mockRouter }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: (p: string) => mockAllowed.includes(p) }) }));
jest.mock('@/lib/apiClient', () => ({
    inventoryApi: { getProductDetail: jest.fn(), updateBatch: jest.fn() },
}));
jest.mock('@/components/inventory/product/EditBatchModal', () => ({
    EditBatchModal: ({ batch, productName, showRates, onSave, onClose }: any) =>
        batch ? (
            <div role="dialog" aria-label="edit batch stub">
                EDIT {batch.batchNo} of {productName} (rates {showRates ? 'shown' : 'hidden'})
                <button onClick={() => onSave(batch.id, { mrp: 260 }).then(onClose).catch(() => {})}>stub save</button>
            </div>
        ) : null,
}));
let mockEditorMounts = 0;
jest.mock('@/components/inventory/EditProductModal', () => ({
    EditProductModal: ({ product, open }: any) => { mockEditorMounts += 1; return open && product ? <div role="dialog" aria-label="edit product stub">EDIT PRODUCT {product.name}</div> : null; },
}));
jest.mock('@/components/inventory/StockAdjustmentModal', () => ({
    StockAdjustmentModal: ({ isOpen, batch, batches, productName }: any) =>
        isOpen ? <div role="dialog">ADJUST {batch.batchNo} of {productName} (of {batches.length})</div> : null,
}));

const getDetail = inventoryApi.getProductDetail as jest.Mock;
const today = new Date();
const inDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return toDayString(d); };

const batch = (id: string, days: number, over: Record<string, unknown> = {}) => ({
    id, batchNo: id.toUpperCase(), expiryDate: inDays(days), mfgDate: null, qtyStrips: 12, qtyLoose: 0, packSize: 1, mrp: 250,
    purchaseRate: 200, landingRate: 218.44, rackLocation: 'R.NO.6-1', ...over,
});
const product = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: '*1CERELAC-RICE 300GM', manufacturer: 'NESTLE', composition: '', drugType: 'allopathy', scheduleType: 'OTC',
    hsnCode: '3004', gstRate: 5, mrp: 250, packSize: 1, packType: 'piece', packUnit: 'Piece', minQty: 5, isFridge: false,
    batches: [batch('b1', 400)], ...over,
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const view = render(<QueryClientProvider client={client}><ProductInventoryPage /></QueryClientProvider>);
    return { invalidate, unmount: view.unmount };
}

describe('Product detail page', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(() => {
        jest.clearAllMocks();
        mockEditorMounts = 0;
        mockAllowed = ['adjust_stock', 'edit_inventory', 'create_purchases', 'view_purchase_rates'];
        getDetail.mockResolvedValue(product());
    });

    it('puts the name, badges and the key facts in one compact header, with ONE heading', async () => {
        getDetail.mockResolvedValue(product({ scheduleType: 'H', isFridge: true, manufacturer: 'NESTLE', composition: 'Rice cereal' }));
        renderPage();
        expect(await screen.findByRole('heading', { level: 1, name: '*1CERELAC-RICE 300GM' })).toBeInTheDocument();
        expect(screen.getByText('Schedule H')).toBeInTheDocument();
        expect(screen.getByText('Cold Chain')).toBeInTheDocument();
        const facts = document.querySelector('dl') as HTMLElement;
        expect(within(facts).getByText('NESTLE')).toBeInTheDocument();
        expect(within(facts).getByText('Sold whole (piece)')).toBeInTheDocument();   // was "1 Piece/piece"
        expect(within(facts).getByText('3004')).toBeInTheDocument();
        expect(within(facts).getByText('5%')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('replaces the eight big cards with ONE summary strip (and drops the duplicate Loose Units card)', async () => {
        renderPage();
        const strip = await screen.findByRole('group', { name: 'Stock summary' });
        for (const label of ['In stock', 'Batches in stock', 'Expiring ≤ 90 days', 'Nearest expiry', 'MRP value', 'Cost value']) {
            expect(within(strip).getByText(label)).toBeInTheDocument();
        }
        expect(screen.queryByText(/loose units/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/batch-wise inventory/i)).not.toBeInTheDocument();
    });

    it('values use loose units and the right labels: cost is at LANDING rate (it said "purchase rate")', async () => {
        getDetail.mockResolvedValue(product({ packSize: 10, packType: 'strip', packUnit: 'tablet', batches: [batch('b1', 400, { qtyStrips: 2, qtyLoose: 5, packSize: 10, mrp: 150, landingRate: 100 })] }));
        renderPage();
        const strip = await screen.findByRole('group', { name: 'Stock summary' });
        expect(within(strip).getByText('₹375')).toBeInTheDocument();                 // 2.5 packs x 150
        expect(within(strip).getByText('₹250')).toBeInTheDocument();                 // 2.5 packs x 100
        expect(within(strip).getByText('at landing rate')).toBeInTheDocument();
    });

    it('is low below the reorder level, and below 10 when none is set (a minimum of 0 meant "never low")', async () => {
        getDetail.mockResolvedValue(product({ minQty: 0, packSize: 10, batches: [batch('b1', 400, { qtyStrips: 9, packSize: 10 })] }));
        const { unmount } = renderPage();
        expect(await screen.findByText('Low Stock')).toBeInTheDocument();
        unmount();
        getDetail.mockResolvedValue(product({ minQty: 0, packSize: 10, batches: [batch('b1', 400, { qtyStrips: 10, packSize: 10 })] }));
        renderPage();
        await screen.findByRole('group', { name: 'Stock summary' });
        expect(screen.queryByText('Low Stock')).not.toBeInTheDocument();
    });

    it('hides purchase economics from people who may not see purchase rates', async () => {
        mockAllowed = ['adjust_stock'];
        renderPage();
        const strip = await screen.findByRole('group', { name: 'Stock summary' });
        expect(within(strip).queryByText('Cost value')).not.toBeInTheDocument();
        const table = screen.getByRole('table');
        for (const h of ['Purchase', 'Landing', 'Value']) expect(within(table).queryByRole('columnheader', { name: h })).not.toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: 'MRP' })).toBeInTheDocument();
    });

    it('is a proper table: caption, column headers, no Mfg Date or Status column (their info moved into other cells)', async () => {
        getDetail.mockResolvedValue(product({ batches: [batch('b1', 400, { mfgDate: '2025-09-01' })] }));
        renderPage();
        const table = await screen.findByRole('table', { name: /batches of .*earliest expiry first/i });
        const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim());
        expect(headers).toEqual(expect.arrayContaining(['Batch', 'Expiry', 'In Stock', 'MRP', 'Rack']));
        expect(headers).not.toContain('Mfg Date');
        expect(headers).not.toContain('Status');
        expect(within(table).getByText(/mfg sept? 25|mfg sep 25/i)).toBeInTheDocument();
    });

    it('tells expired from expiring-today from empty (today was wrongly shown as expired)', async () => {
        getDetail.mockResolvedValue(product({ batches: [
            batch('old', -12), batch('today', 0), batch('gone', -40, { qtyStrips: 0, qtyLoose: 0 }),
        ] }));
        renderPage();
        const table = await screen.findByRole('table');
        expect(within(within(table).getByText('OLD').closest('tr') as HTMLElement).getByText('Expired 12 days ago')).toBeInTheDocument();
        expect(within(within(table).getByText('TODAY').closest('tr') as HTMLElement).getByText('Expires today')).toBeInTheDocument();
        expect(within(within(table).getByText('GONE').closest('tr') as HTMLElement).getByText('Empty')).toBeInTheDocument();
    });

    it('"Receive Stock" goes to the purchases screen, not the missing /purchases/new page that gave a 404', async () => {
        renderPage();
        expect(await screen.findByRole('link', { name: /receive stock/i })).toHaveAttribute('href', '/dashboard/purchases');
    });

    it('the empty state offers the same working link', async () => {
        getDetail.mockResolvedValue(product({ batches: [] }));
        renderPage();
        expect(await screen.findByText('No batches yet')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /receive first stock/i })).toHaveAttribute('href', '/dashboard/purchases');
    });

    it('Refresh refreshes everything under ["inventory"] and reloads this product (it invalidated a key this page does not use, so it did nothing)', async () => {
        const { invalidate } = renderPage();
        await userEvent.click(await screen.findByRole('button', { name: /refresh/i }));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
        await waitFor(() => expect(getDetail).toHaveBeenCalledTimes(2));
    });

    it('a failed load is an error with a retry, NOT "Product Not Found"', async () => {
        getDetail.mockRejectedValueOnce({ detail: 'Gateway timeout' });
        renderPage();
        expect(await screen.findByText(/couldn.t load this product/i)).toBeInTheDocument();
        expect(screen.getByText(/gateway timeout/i)).toBeInTheDocument();
        expect(screen.queryByText('Product Not Found')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('says "Product Not Found" only when the server really has no such product', async () => {
        getDetail.mockResolvedValue(null);
        renderPage();
        expect(await screen.findByRole('heading', { name: 'Product Not Found' })).toBeInTheDocument();
    });

    it('Adjust opens the modal with the chosen batch and all batches; people without the permission do not see the button', async () => {
        getDetail.mockResolvedValue(product({ batches: [batch('b1', 100), batch('b2', 200)] }));
        const { unmount } = renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Adjust stock of batch B2' }));
        expect(await screen.findByRole('dialog')).toHaveTextContent('ADJUST B2 of *1CERELAC-RICE 300GM (of 2)');
        unmount();

        mockAllowed = [];
        renderPage();
        await screen.findByRole('table');
        expect(screen.queryByRole('button', { name: /adjust stock/i })).not.toBeInTheDocument();
    });

    it('the back arrow is a link with a name; it goes back in history when there is some', async () => {
        renderPage();
        const back = await screen.findByRole('link', { name: 'Back to Inventory' });
        expect(back).toHaveAttribute('href', '/dashboard/inventory');
        Object.defineProperty(window.history, 'length', { value: 3, configurable: true });
        await userEvent.click(back);
        expect(mockRouter.back).toHaveBeenCalled();
    });

    it('has no column-picking "Quick edit" any more: each batch has an Edit button that opens the editor', async () => {
        getDetail.mockResolvedValue(product({ batches: [batch('b1', 100), batch('b2', 200)] }));
        renderPage();
        await screen.findByRole('table');
        expect(screen.queryByRole('combobox', { name: /quick edit/i })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Edit batch B2' }));
        expect(await screen.findByRole('dialog', { name: 'edit batch stub' })).toHaveTextContent('EDIT B2 of *1CERELAC-RICE 300GM (rates shown)');
    });

    it('the editor is told whether this person may see purchase rates', async () => {
        mockAllowed = ['edit_inventory'];
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Edit batch B1' }));
        expect(await screen.findByRole('dialog', { name: 'edit batch stub' })).toHaveTextContent('(rates hidden)');
    });

    it('saving sends the patch for THAT batch, refreshes everything under ["inventory"], and returns the server\'s answer to the form', async () => {
        (inventoryApi.updateBatch as jest.Mock).mockResolvedValue({ changed: ['mrp'], warnings: [] });
        const { invalidate } = renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Edit batch B1' }));
        await userEvent.click(await screen.findByRole('button', { name: 'stub save' }));
        await waitFor(() => expect(inventoryApi.updateBatch).toHaveBeenCalledWith('b1', { mrp: 260 }));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'edit batch stub' })).not.toBeInTheDocument());
    });

    it('a rejected save goes back to the form (it shows the reason next to the field), the page does not swallow it', async () => {
        (inventoryApi.updateBatch as jest.Mock).mockRejectedValue({ errors: { batchNo: 'Batch X already exists' } });
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Edit batch B1' }));
        await userEvent.click(await screen.findByRole('button', { name: 'stub save' }));
        await waitFor(() => expect(inventoryApi.updateBatch).toHaveBeenCalled());
        expect(screen.getByRole('dialog', { name: 'edit batch stub' })).toBeInTheDocument();   // still open
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('the product editor is only mounted once Edit Product is pressed (it loaded the distributor list on every visit)', async () => {
        renderPage();
        await screen.findByRole('table');
        expect(mockEditorMounts).toBe(0);
        await userEvent.click(screen.getByRole('button', { name: /edit product/i }));
        await screen.findByRole('dialog', { name: 'edit product stub' });
        expect(mockEditorMounts).toBeGreaterThan(0);
    });

    it('Edit Product in the header opens the product editor', async () => {
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: /edit product/i }));
        expect(await screen.findByRole('dialog', { name: 'edit product stub' })).toHaveTextContent('EDIT PRODUCT *1CERELAC-RICE 300GM');
    });

    it('editing needs edit_inventory (what the API enforces): manage_products alone shows no Edit buttons', async () => {
        mockAllowed = ['manage_products', 'view_purchase_rates'];
        renderPage();
        await screen.findByRole('table');
        expect(screen.queryByRole('button', { name: /^edit batch/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit product/i })).not.toBeInTheDocument();
    });
});
