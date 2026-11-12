import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPage from '../page';
import { getSearch, setUrl } from '@/components/inventory/testing/navMock';
import { downloadBatchDetail, downloadProductSummary } from '@/lib/inventoryApi';

const mockToast = jest.fn();
jest.mock('next/navigation', () => require('@/components/inventory/testing/navMock').navigationMock);
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
jest.mock('@/hooks/useInventorySummary', () => ({ useInventorySummary: () => ({ counts: { total: 1234, expiring: 7, lowStock: 12 } }) }));
jest.mock('@/lib/inventoryApi', () => ({ downloadProductSummary: jest.fn(), downloadBatchDetail: jest.fn() }));

// the real children have their own tests: stand-ins keep this one about the PAGE
jest.mock('@/components/inventory/InventoryStatCards', () => ({
    InventoryStatCards: ({ onTabChange }: any) => <button onClick={() => onTabChange('expiring')}>card: open expiring</button>,
}));
jest.mock('@/components/inventory/StockTable', () => ({
    StockTable: ({ onAdjustClick, onEditClick }: any) => (
        <div>
            <p>ALL STOCK TABLE</p>
            <button onClick={() => onEditClick({ id: 'p1', name: 'Dolo 650' })}>edit</button>
            <button onClick={() => onAdjustClick({ id: 'b2', batchNo: 'B2' }, { id: 'p1', name: 'Dolo 650', batches: [{ id: 'b1' }, { id: 'b2' }] })}>adjust</button>
        </div>
    ),
}));
jest.mock('@/components/inventory/ExpiryTable', () => ({ ExpiryTable: () => <p>EXPIRY TABLE</p> }));
jest.mock('@/components/inventory/LowStockTable', () => ({ LowStockTable: () => <p>LOW STOCK TABLE</p> }));
let mockEditorMounts = 0;
jest.mock('@/components/inventory/EditProductModal', () => ({
    EditProductModal: ({ product }: any) => { mockEditorMounts += 1; return <div role="dialog" aria-label="edit product stub">EDIT {product.name}</div>; },
}));
jest.mock('@/components/inventory/StockAdjustmentModal', () => ({
    StockAdjustmentModal: ({ isOpen, batch, batches, productName }: any) =>
        isOpen ? <div role="dialog">ADJUSTING {batch.batchNo} of {productName} (choose from {batches.length})</div> : null,
}));

describe('Inventory page', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(() => { jest.clearAllMocks(); setUrl(''); mockEditorMounts = 0; });

    it('opens on All Stock and shows the counts from the single source on the tabs', () => {
        render(<InventoryPage />);
        expect(screen.getByText('ALL STOCK TABLE')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /all stock\s*1,234/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /expiring soon\s*7/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /low stock\s*12/i })).toBeInTheDocument();
    });

    it('the tab is in the URL: a link or a refresh opens the same tab (it was component state and was lost)', () => {
        setUrl('tab=low_stock');
        render(<InventoryPage />);
        expect(screen.getByText('LOW STOCK TABLE')).toBeInTheDocument();
        expect(screen.queryByText('ALL STOCK TABLE')).not.toBeInTheDocument();
    });

    it('clicking a tab changes the URL, and the default tab keeps the URL clean', async () => {
        render(<InventoryPage />);
        await userEvent.click(screen.getByRole('tab', { name: /expiring soon/i }));
        expect(getSearch()).toBe('tab=expiring');
        expect(await screen.findByText('EXPIRY TABLE')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('tab', { name: /all stock/i }));
        expect(getSearch()).toBe('');
    });

    it('a stat card opens its tab', async () => {
        render(<InventoryPage />);
        await userEvent.click(screen.getByRole('button', { name: 'card: open expiring' }));
        expect(getSearch()).toBe('tab=expiring');
    });

    it('adjusting hands the modal the chosen batch AND all the product\'s batches, so the right one can be picked', async () => {
        render(<InventoryPage />);
        await userEvent.click(screen.getByRole('button', { name: 'adjust' }));
        expect(await screen.findByRole('dialog')).toHaveTextContent('ADJUSTING B2 of Dolo 650 (choose from 2)');
    });

    it('exports the Product Summary with the page\'s current search, schedule and sort', async () => {
        setUrl('q=dolo&schedule=H&sort=stock&order=desc');
        render(<InventoryPage />);
        await userEvent.click(screen.getByRole('button', { name: /export/i }));
        await userEvent.click(await screen.findByRole('menuitem', { name: /product summary/i }));
        await waitFor(() => expect(downloadProductSummary).toHaveBeenCalledWith('o1', { search: 'dolo', scheduleType: 'H', sortBy: 'stock', sortOrder: 'desc' }));
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export ready' }));
    });

    it('exports Batch Detail, and a failed export says why and what to do', async () => {
        (downloadBatchDetail as jest.Mock).mockRejectedValueOnce({ detail: 'No report access' });
        render(<InventoryPage />);
        await userEvent.click(screen.getByRole('button', { name: /export/i }));
        await userEvent.click(await screen.findByRole('menuitem', { name: /batch detail/i }));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Export failed', description: expect.stringContaining('No report access') })));
        expect(downloadBatchDetail).toHaveBeenCalledWith('o1', '');
    });

    it('offers Add Stock (GRN) to people who can create purchases', () => {
        render(<InventoryPage />);
        expect(screen.getByRole('button', { name: /add stock \(grn\)/i })).toBeInTheDocument();
    });

    it('the product editor is not even mounted until you open it (it loaded the distributor list on every visit)', async () => {
        render(<InventoryPage />);
        expect(mockEditorMounts).toBe(0);
        await userEvent.click(screen.getByRole('button', { name: 'edit' }));
        expect(await screen.findByRole('dialog', { name: 'edit product stub' })).toHaveTextContent('EDIT Dolo 650');
        expect(mockEditorMounts).toBeGreaterThan(0);
    });
});
