import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartList } from './CartList';
import { useBillingStore } from '@/store/billingStore';
import { productsApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, productsApi: { ...actual.productsApi, search: jest.fn() } };
});

const batch = (id: string, batchNo: string) => ({
    id, outletId: 'o', outletProductId: 'op', batchNo, expiryDate: '2099-12-31', mrp: 100, purchaseRate: 50, landingRate: 60, saleRate: 100,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip', isActive: true, createdAt: '',
});
const item = (batchId: string, name: string): any => ({
    batchId, productId: `p-${batchId}`, name, composition: 'SALT', packSize: 10, packUnit: 'tablet', packType: 'strip', batchNo: 'B1', expiryDate: '2099-12-31',
    scheduleType: 'OTC', mrp: 100, saleRate: 100, rate: 100, landingRate: 60, purchaseRate: 50, qtyStrips: 1, qtyLoose: 0, totalQty: 1, saleMode: 'strip',
    discountPct: 0, gstRate: 12, taxableAmount: 89.29, gstAmount: 10.71, totalAmount: 100,
});

function seed(cart: any[]) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({
        drafts: { ...s.drafts, [id]: { ...s.drafts[id], cart } },
        activeStaff: { id: 's1', name: 'Staff', role: 'cashier', maxDiscount: 100, canEditRate: false } as any,
    }));
    return id;
}
const renderList = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CartList /></QueryClientProvider>,
);

beforeEach(() => {
    jest.clearAllMocks();
    (productsApi.search as jest.Mock).mockResolvedValue([]);
});

describe('CartList', () => {
    it('empty bill: big icon area and the prompt text, no item count', () => {
        seed([]);
        renderList();
        expect(screen.getByText('Search or scan a medicine to start the bill')).toBeInTheDocument();
        expect(screen.queryByTestId('cart-summary-items')).not.toBeInTheDocument();
    });

    it('one card per line, in cart order, with the item count', () => {
        seed([item('b1', 'DOLO 650'), item('b2', 'LOSAR 50')]);
        renderList();
        expect(screen.getAllByTestId('cart-line-card')).toHaveLength(2);
        expect(screen.getAllByTestId('cart-line-card')[1]).toHaveTextContent('LOSAR 50');
        expect(screen.getByTestId('cart-summary-items')).toHaveTextContent('2 Items');
    });

    it('the list leaves room under it for the pinned bottom bar', () => {
        seed([item('b1', 'DOLO 650')]);
        renderList();
        expect(screen.getByTestId('mobile-cart-list').className).toMatch(/pb-48/);
    });

    it('tapping a card opens the line editor for that line', async () => {
        seed([item('b1', 'DOLO 650'), item('b2', 'LOSAR 50')]);
        (productsApi.search as jest.Mock).mockResolvedValue([{ id: 'p-b2', batches: [batch('b2', 'B1')] }]);
        renderList();
        fireEvent.click(screen.getByRole('button', { name: 'Edit LOSAR 50' }));
        expect(await screen.findByRole('radiogroup', { name: 'Batch' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
        await waitFor(() => expect(productsApi.search).toHaveBeenCalled());
    });

    it('removing the line from outside closes the editor', async () => {
        const id = seed([item('b1', 'DOLO 650')]);
        renderList();
        fireEvent.click(screen.getByRole('button', { name: 'Edit DOLO 650' }));
        expect(await screen.findByRole('radiogroup', { name: 'Batch' })).toBeInTheDocument();
        useBillingStore.getState().removeFromCart(id, 'b1');
        await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Batch' })).not.toBeInTheDocument());
    });
});
