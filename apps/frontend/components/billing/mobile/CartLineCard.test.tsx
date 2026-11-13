import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartLineCard } from './CartLineCard';
import { CartList } from './CartList';
import { useBillingStore } from '@/store/billingStore';
import { productsApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, productsApi: { ...actual.productsApi, search: jest.fn() } };
});

/** MM/YY a number of months from now (getExpiryStatus compares to the end of that month) */
const mmyy = (monthsAhead: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthsAhead);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear() % 100).padStart(2, '0')}`;
};

const batch = (extra: any = {}) => ({
    id: 'b1', outletId: 'o', outletProductId: 'op', batchNo: 'B1', expiryDate: '2099-12-31', mrp: 100, purchaseRate: 50, landingRate: 60, saleRate: 100,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip', isActive: true, createdAt: '', ...extra,
});
const item = (extra: any = {}): any => ({
    batchId: 'b1', productId: 'p1', name: 'DOLO 650 TAB 15S', composition: 'PARACETAMOL', packSize: 10, packUnit: 'tablet', packType: 'strip',
    batchNo: 'B1', expiryDate: '2099-12-31', scheduleType: 'OTC', mrp: 100, saleRate: 100, rate: 100, landingRate: 60, purchaseRate: 50,
    qtyStrips: 2, qtyLoose: 0, totalQty: 2, saleMode: 'strip', discountPct: 0, gstRate: 12, taxableAmount: 178.57, gstAmount: 21.43, totalAmount: 200,
    ...extra,
});

let draftId = '';
function seed(cart: any[], opts: { role?: string; showMarginInfo?: boolean; saleType?: 'RETAIL' | 'WHOLESALE' } = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    draftId = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({
        drafts: { ...s.drafts, [draftId]: { ...s.drafts[draftId], cart, saleType: opts.saleType ?? 'RETAIL' } },
        activeStaff: { id: 's1', name: 'Staff', role: opts.role ?? 'admin', maxDiscount: 100, canEditRate: false } as any,
        showMarginInfo: opts.showMarginInfo ?? true,
    }));
}
const line = () => useBillingStore.getState().drafts[draftId].cart[0];

function renderCard(it: any, opts: any = {}) {
    seed([it], opts);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <CartLineCard item={useBillingStore.getState().drafts[draftId].cart[0]} draftId={draftId} saleType={opts.saleType ?? 'RETAIL'} showMargin={!!opts.showMargin} onEdit={opts.onEdit ?? jest.fn()} />
        </QueryClientProvider>,
    );
}
const wrap = (ui: React.ReactElement) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);
// the card fetches the product's batches (react-query): wait for the answer to be rendered, with real timers, so a loaded machine cannot race it
const batchesLoaded = async () => {
    await waitFor(() => expect(productsApi.search).toHaveBeenCalled());
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

beforeEach(() => {
    jest.clearAllMocks();
    (productsApi.search as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'DOLO 650 TAB 15S', batches: [batch()] }]);
});

describe('CartLineCard: what the card shows', () => {
    it('shows name, composition, batch, expiry and the amount, with a green bar for a long-dated batch', () => {
        renderCard(item());
        expect(screen.getByText('DOLO 650 TAB 15S')).toBeInTheDocument();
        expect(screen.getByText('PARACETAMOL')).toBeInTheDocument();
        expect(screen.getByText('B: B1')).toBeInTheDocument();
        expect(screen.getByText('Exp: 12/99')).toBeInTheDocument();
        expect(screen.getByTestId('line-amount')).toHaveTextContent('₹200.00');
        expect(screen.getByTestId('expiry-bar')).toHaveAttribute('data-status', 'good');
        expect(screen.queryByText('Expired')).not.toBeInTheDocument();
    });

    it('expiry states carry text as well as colour: Expired, Exp soon, Near expiry', () => {
        const { unmount } = renderCard(item({ expiryDate: '01/20' }));
        expect(screen.getByText('Expired')).toBeInTheDocument();
        expect(screen.getByTestId('expiry-bar')).toHaveAttribute('data-status', 'expired');
        unmount();

        const soon = renderCard(item({ expiryDate: mmyy(1) }));
        expect(screen.getByText('Exp soon')).toBeInTheDocument();
        expect(screen.getByTestId('expiry-bar')).toHaveAttribute('data-status', 'expiring_soon');
        soon.unmount();

        renderCard(item({ expiryDate: mmyy(5) }));
        expect(screen.getByText('Near expiry')).toBeInTheDocument();
    });

    it('stock badges: Out of stock, Expired batch, Low stock', () => {
        const a = renderCard(item({ batchAvailabilityStatus: 'BATCH_UNAVAILABLE' }));
        expect(screen.getByText('Out of stock')).toBeInTheDocument();
        a.unmount();
        const b = renderCard(item({ batchAvailabilityStatus: 'BATCH_EXPIRED' }));
        expect(screen.getByText('Expired')).toBeInTheDocument();
        b.unmount();
        renderCard(item({ batchAvailabilityStatus: 'LOW_STOCK', availableStock: 4 }));
        expect(screen.getByText('Low stock')).toBeInTheDocument();
    });

    it('a line sold below its cost gets a "Below cost" badge (no cost figure unless the margin line is on)', () => {
        renderCard(item({ landingRate: 150 }));
        expect(screen.getByText('Below cost')).toBeInTheDocument();
        expect(screen.queryByTestId('line-margin')).not.toBeInTheDocument();
        expect(screen.queryByText(/150/)).not.toBeInTheDocument();
    });

    it('shows the discount badge', () => {
        renderCard(item({ discountPct: 10, totalAmount: 180 }));
        expect(screen.getByText('10% off')).toBeInTheDocument();
    });

    it('the margin line is shown only when the caller says so', () => {
        const a = renderCard(item(), { showMargin: false });
        expect(screen.queryByTestId('line-margin')).not.toBeInTheDocument();
        a.unmount();
        renderCard(item(), { showMargin: true });
        expect(screen.getByTestId('line-margin')).toHaveTextContent(/Landing ₹60\.00 · Profit ₹58\.57 \(32\.8%\)/);
    });

    it('tapping the card asks to open the editor', () => {
        const onEdit = jest.fn();
        renderCard(item(), { onEdit });
        fireEvent.click(screen.getByRole('button', { name: 'Edit DOLO 650 TAB 15S' }));
        expect(onEdit).toHaveBeenCalledWith('b1');
    });
});

describe('CartLineCard: what was added is shown, not editable on the card', () => {
    it('has no "add quantity" controls: no steppers, no number fields (changing it is done in the editor)', () => {
        renderCard(item({ qtyStrips: 2 }));
        expect(screen.queryByLabelText('Strips increase')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Strips decrease')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Loose increase')).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('says the quantity in words', () => {
        renderCard(item({ qtyStrips: 2, qtyLoose: 0 }));
        expect(screen.getByTestId('cart-qty-text')).toHaveTextContent('2 strips');
    });

    it('one strip is singular, loose units are added with a plus', () => {
        renderCard(item({ qtyStrips: 1, qtyLoose: 3 }));
        expect(screen.getByTestId('cart-qty-text')).toHaveTextContent('1 strip + 3 loose');
    });

    it('loose only', () => {
        renderCard(item({ qtyStrips: 0, qtyLoose: 4 }));
        expect(screen.getByTestId('cart-qty-text')).toHaveTextContent('4 loose');
    });

    it('uses the pack word of the product (bottles, not strips)', () => {
        renderCard(item({ qtyStrips: 3, qtyLoose: 0, packType: 'bottle', packSize: 1 }));
        expect(screen.getByTestId('cart-qty-text')).toHaveTextContent('3 bottles');
    });

    it('the card does not ask the server for the product batches any more (it has nothing to edit)', () => {
        renderCard(item());
        expect(productsApi.search).not.toHaveBeenCalled();
    });
});

describe('CartList: margin line is role and toggle gated', () => {
    const renderList = () => render(wrap(<CartList />));

    it('hidden for a cashier even with the profit toggle on', () => {
        seed([item()], { role: 'cashier', showMarginInfo: true });
        renderList();
        expect(screen.queryByTestId('line-margin')).not.toBeInTheDocument();
    });

    it('shown for an admin with the toggle on, hidden when the toggle is off', () => {
        seed([item()], { role: 'admin', showMarginInfo: true });
        const a = renderList();
        expect(screen.getByTestId('line-margin')).toBeInTheDocument();
        a.unmount();
        seed([item()], { role: 'admin', showMarginInfo: false });
        renderList();
        expect(screen.queryByTestId('line-margin')).not.toBeInTheDocument();
    });
});
