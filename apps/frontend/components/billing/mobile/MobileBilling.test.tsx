import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileBilling } from './MobileBilling';
import { useBillingStore } from '@/store/billingStore';
import { quickAddLine } from '@/lib/cartLine';

jest.mock('uuid', () => ({ v4: () => `id-${Math.random().toString(36).slice(2)}` }));
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    usePathname: () => '/billing',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => ({ data: undefined }) }));
jest.mock('@/hooks/useSaveBill', () => ({ useSaveBill: () => ({ saveBill: jest.fn().mockResolvedValue(undefined), isLoading: false }) }));
jest.mock('@/hooks/useProductSearch', () => ({ useProductSearch: () => ({ data: [], isFetching: false }) }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, productsApi: { ...actual.productsApi, search: jest.fn().mockResolvedValue([]), substitutes: jest.fn().mockResolvedValue({ products: [] }) } };
});

const batch: any = { id: 'b1', batchNo: 'B1', expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50, landingRate: 55, qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip' };
const product: any = { id: 'p1', name: 'DOLO 650 TAB', composition: 'PARACETAMOL', manufacturer: 'Micro', gstRate: 12, scheduleType: 'OTC', packUnit: 'tablet', packType: 'strip', hsnCode: '3004', batches: [batch] };

function startBill(opts: { items?: number; saleType?: 'RETAIL' | 'WHOLESALE'; quotation?: boolean } = {}) {
    const store = useBillingStore.getState();
    const id = store.createDraft();
    if (opts.saleType === 'WHOLESALE') store.setSaleType(id, 'WHOLESALE');
    if (opts.quotation) store.setDraftDocumentMode(id, 'quotation');
    for (let i = 0; i < (opts.items ?? 0); i++) {
        const built: any = quickAddLine({ product: { ...product, id: `p${i}` }, batch: { ...batch, id: `b${i}` }, qtyStrips: '2', qtyLoose: '', discountPct: '', saleType: opts.saleType ?? 'RETAIL' });
        store.addToCart(id, built.item);
    }
    return id;
}

function renderShell() {
    return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MobileBilling />
        </QueryClientProvider>,
    );
}

beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
    Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn() }) });
});

beforeEach(() => {
    useBillingStore.setState({ drafts: {}, activeDraftId: null, isPinVerified: true, activeStaff: { id: 's1', name: 'Test', role: 'admin' } as any });
});

afterEach(async () => { cleanup(); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); });

describe('MobileBilling shell', () => {
    it('an empty bill shows the empty state and a disabled main button that says why', () => {
        startBill();
        renderShell();
        expect(screen.getByText(/Search or scan a medicine/i)).toBeInTheDocument();
        expect(screen.getByTestId('checkout-button')).toBeDisabled();
        expect(screen.getByText(/Add items to the bill/i)).toBeInTheDocument();
        expect(screen.getByTestId('mobile-search-open')).toBeInTheDocument();
    });

    it('lines appear as cards and the bar shows the total and "Collect"', () => {
        startBill({ items: 2 });
        renderShell();
        expect(screen.getAllByText('DOLO 650 TAB')).toHaveLength(2);
        expect(screen.getByTestId('checkout-button')).toBeEnabled();
        expect(screen.getByTestId('checkout-button')).toHaveTextContent(/Collect ₹/);
        expect(screen.getByTestId('grand-total-amount')).toBeInTheDocument();
    });

    it('the main button opens the payment sheet where one tap on Cash / UPI / Card saves the bill', async () => {
        startBill({ items: 1 });
        renderShell();
        fireEvent.click(screen.getByTestId('checkout-button'));
        expect(await screen.findByTestId('pay-cash')).toBeInTheDocument();
        expect(screen.getByTestId('pay-upi')).toBeInTheDocument();
        expect(screen.getByTestId('pay-card')).toBeInTheDocument();
        expect(screen.queryByLabelText(/received/i)).not.toBeInTheDocument();
    });

    it('the search bar opens the full-screen search', async () => {
        startBill();
        renderShell();
        fireEvent.click(screen.getByTestId('mobile-search-open'));
        expect(await screen.findByTestId('mobile-search-input')).toBeInTheDocument();
    });

    it('tapping the total opens the totals sheet', async () => {
        startBill({ items: 1 });
        renderShell();
        fireEvent.click(screen.getByLabelText('Show bill totals'));
        expect(await screen.findByText('Bill totals')).toBeInTheDocument();
        expect((await screen.findAllByText(/Net payable/i)).length).toBeGreaterThan(0);
    });

    it('a quotation saves straight from the bar (no payment step) and says so', () => {
        startBill({ items: 1, quotation: true });
        renderShell();
        expect(screen.getByTestId('checkout-button')).toHaveTextContent(/Save quotation/i);
    });

    it('editing a saved bill: Save changes opens the payment step on the bill\'s own mode, then asks for the reason', async () => {
        const id = startBill({ items: 1 });
        useBillingStore.getState().updateDraftHeader(id, { editingSaleId: 'sale-1', revisionAction: 'commercial_correction', payment: { method: 'upi' } } as any);
        renderShell();
        expect(screen.getByTestId('checkout-button')).toHaveTextContent(/Save changes/i);
        fireEvent.click(screen.getByTestId('checkout-button'));
        expect(await screen.findByTestId('pay-upi')).toBeInTheDocument();                      // the payment method is shown
        expect(screen.getByTestId('payment-current')).toHaveTextContent('Currently paid by UPI');
        expect(useBillingStore.getState().drafts[id].payment.method).toBe('upi');               // opening the sheet did not reset it to cash
        fireEvent.click(screen.getByTestId('payment-edit-save'));
        expect(await screen.findByTestId('revision-confirm')).toBeInTheDocument();
    });

    it('a wholesale bill is on credit', () => {
        startBill({ items: 1, saleType: 'WHOLESALE' });
        renderShell();
        expect(screen.getByTestId('checkout-button')).toHaveTextContent(/credit/i);
    });
});
