import "@testing-library/jest-dom";
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineEditorSheet } from './LineEditorSheet';
import { useBillingStore } from '@/store/billingStore';
import { productsApi } from '@/lib/apiClient';

jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, productsApi: { ...actual.productsApi, search: jest.fn() } };
});

const batch = (id: string, batchNo: string, extra: any = {}) => ({
    id, outletId: 'o', outletProductId: 'op', batchNo, expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50, landingRate: 60, saleRate: 100,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip', isActive: true, createdAt: '', ...extra,
});
const baseItem = (extra: any = {}): any => ({
    batchId: 'b1', productId: 'p1', name: 'DOLO 650 TAB', composition: 'PARACETAMOL', packSize: 10, packUnit: 'tablet', packType: 'strip', batchNo: 'B1',
    expiryDate: '2099-12-31', scheduleType: 'OTC', mrp: 100, saleRate: 100, rate: 100, landingRate: 60, purchaseRate: 50, qtyStrips: 2, qtyLoose: 0, totalQty: 2,
    saleMode: 'strip', discountPct: 0, gstRate: 12, taxableAmount: 178.57, gstAmount: 21.43, totalAmount: 200, ...extra,
});

let draftId = '';
function seed(cart: any[], opts: { role?: string; saleType?: 'RETAIL' | 'WHOLESALE' } = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    draftId = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({
        drafts: { ...s.drafts, [draftId]: { ...s.drafts[draftId], cart, saleType: opts.saleType ?? 'RETAIL' } },
        activeStaff: { id: 's1', name: 'Staff', role: opts.role ?? 'admin', maxDiscount: 100, canEditRate: false } as any,
    }));
}
const cart = () => useBillingStore.getState().drafts[draftId].cart;

/** Same wiring as CartList: the sheet is always mounted, `item` is looked up live in the cart */
function Harness({ batchId = 'b1' }: { batchId?: string }) {
    const [open, setOpen] = useState(true);
    const lines = useBillingStore((s) => s.drafts[draftId]?.cart ?? []);
    const it = open ? lines.find((l) => l.batchId === batchId) ?? null : null;
    return <LineEditorSheet item={it} onClose={() => setOpen(false)} />;
}
const renderEditor = (batchId?: string) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Harness batchId={batchId} /></QueryClientProvider>,
);
const batchesLoaded = async () => { await waitFor(() => expect(productsApi.search).toHaveBeenCalled()); await act(async () => {}); };
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

beforeEach(() => {
    jest.clearAllMocks();
    (productsApi.search as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'DOLO 650 TAB', batches: [batch('b1', 'B1'), batch('b2', 'B2', { mrp: 110 }), batch('bx', 'OLD', { expiryDate: '01/20' })] }]);
});

describe('LineEditorSheet: fields', () => {
    it('lists only the non-expired batches as choices and pre-selects the line\'s batch', async () => {
        seed([baseItem()]);
        renderEditor();
        expect(await screen.findByRole('radio', { name: /B2/ })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /B1/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /B2/ })).toHaveAttribute('aria-checked', 'false');
        expect(screen.queryByRole('radio', { name: /OLD/ })).not.toBeInTheDocument();
    });

    it('strips and loose steppers use the editor test ids; loose only when the pack allows it', async () => {
        seed([baseItem()]);
        const a = renderEditor();
        await batchesLoaded();
        expect(screen.getByTestId('inline-qty-strips')).toHaveValue('2');
        expect(screen.getByTestId('inline-qty-loose')).toHaveValue('0');
        a.unmount();

        (productsApi.search as jest.Mock).mockResolvedValue([{ id: 'p1', batches: [batch('b1', 'B1', { packSize: 1, packType: 'bottle', allowsLoose: false })] }]);
        seed([baseItem({ packSize: 1, packType: 'bottle' })]);
        renderEditor();
        await batchesLoaded();
        expect(screen.getByTestId('inline-qty-strips')).toBeInTheDocument();
        expect(screen.queryByTestId('inline-qty-loose')).not.toBeInTheDocument();
    });

    it('discount value resets to 0 when the % / Rs toggle changes, and numbers use the decimal keypad', async () => {
        seed([baseItem({ discountPct: 10, totalAmount: 180 })]);
        renderEditor();
        await batchesLoaded();
        const field = screen.getByTestId('editor-discount');
        expect(field).toHaveValue('10');
        expect(field).toHaveAttribute('inputmode', 'decimal');
        fireEvent.click(screen.getByRole('button', { name: 'Rs' }));
        expect(field).toHaveValue('0');
        type(field, '25');
        expect(screen.getByTestId('editor-sell-amount')).toHaveTextContent('₹175.00');   // 200 - Rs 25
    });

    it('wholesale shows free qty and PTR / PTS; retail does not', async () => {
        seed([baseItem()], { saleType: 'WHOLESALE' });
        const a = renderEditor();
        await batchesLoaded();
        expect(screen.getByLabelText('PTR (Rs)')).toBeInTheDocument();
        expect(screen.getByLabelText('PTS (Rs)')).toBeInTheDocument();
        expect(screen.getByLabelText('Free qty (strips)')).toBeInTheDocument();
        a.unmount();
        seed([baseItem()], { saleType: 'RETAIL' });
        renderEditor();
        await batchesLoaded();
        expect(screen.queryByLabelText('PTR (Rs)')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Free qty (strips)')).not.toBeInTheDocument();
    });
});

describe('LineEditorSheet: save', () => {
    it('saves quantity and discount into the same line with recomputed amounts', async () => {
        seed([baseItem()]);
        renderEditor();
        await batchesLoaded();
        fireEvent.click(screen.getByLabelText('Strips increase'));
        type(screen.getByTestId('editor-discount'), '10');
        expect(screen.getByTestId('editor-sell-amount')).toHaveTextContent('₹270.00');
        fireEvent.click(screen.getByRole('button', { name: /Save/ }));
        expect(cart()).toHaveLength(1);
        expect(cart()[0]).toMatchObject({ batchId: 'b1', qtyStrips: 3, discountPct: 10, totalAmount: 270 });
        await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Batch' })).not.toBeInTheDocument());   // sheet closed
    });

    it('choosing another batch replaces the line (remove + add), like the desktop editor', async () => {
        seed([baseItem()]);
        renderEditor();
        fireEvent.click(await screen.findByRole('radio', { name: /B2/ }));
        fireEvent.click(screen.getByRole('button', { name: /Save/ }));
        expect(cart()).toHaveLength(1);
        expect(cart()[0]).toMatchObject({ batchId: 'b2', batchNo: 'B2', mrp: 110 });
    });

    it('quantity 0 blocks Save with an inline reason', async () => {
        seed([baseItem()]);
        renderEditor();
        await batchesLoaded();
        type(screen.getByTestId('inline-qty-strips'), '0');
        expect(screen.getByTestId('editor-blockers')).toHaveTextContent('Quantity must be greater than 0.');
        expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
    });

    it('a discount over 100% blocks Save with an inline reason', async () => {
        seed([baseItem()]);
        renderEditor();
        await batchesLoaded();
        type(screen.getByTestId('editor-discount'), '150');
        expect(screen.getByTestId('editor-blockers')).toHaveTextContent('Discount must be between 0 and 100%.');
        expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
    });

    it('a loss-making sale blocks Save and says which cost it is below (no figure for a cashier)', async () => {
        seed([baseItem()], { role: 'cashier' });
        renderEditor();
        await batchesLoaded();
        type(screen.getByTestId('editor-discount'), '50');           // 50 a pack against a landing cost of 60
        const msg = screen.getByTestId('editor-blockers');
        expect(msg).toHaveTextContent('Loss-making sale prevented');
        expect(msg).toHaveTextContent('landing cost');
        expect(msg).not.toHaveTextContent('60.00');
        expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Save/ }));
        expect(cart()[0].totalAmount).toBe(200);                        // nothing was saved
    });

    it('wholesale names the purchase rate as the cost basis, and an admin sees the figure', async () => {
        seed([baseItem({ ptr: 80, pts: 70 })], { role: 'admin', saleType: 'WHOLESALE' });
        renderEditor();
        await batchesLoaded();
        type(screen.getByTestId('editor-pts'), '40');                   // below the purchase rate of 50
        const msg = screen.getByTestId('editor-blockers');
        expect(msg).toHaveTextContent('Loss-making sale prevented');
        expect(msg).toHaveTextContent('purchase rate');
        expect(msg).toHaveTextContent('₹50.00 per pack');
    });

    it('more than the stock is a yellow warning, not a block', async () => {
        seed([baseItem()]);
        renderEditor();
        await batchesLoaded();
        type(screen.getByTestId('inline-qty-strips'), '11');
        expect(screen.getByTestId('editor-stock-warning')).toHaveTextContent('more than the stock available');
        expect(screen.getByRole('button', { name: /Save/ })).toBeEnabled();
    });
});

describe('LineEditorSheet: margin visibility', () => {
    it('cost and margin are hidden for a cashier', async () => {
        seed([baseItem()], { role: 'cashier' });
        renderEditor();
        await batchesLoaded();
        expect(screen.queryByTestId('editor-margin')).not.toBeInTheDocument();
        expect(screen.queryByText(/Est\. cost/i)).not.toBeInTheDocument();
        expect(screen.getByTestId('editor-sell-amount')).toBeInTheDocument();
    });

    it('cost and margin are shown for an admin', async () => {
        seed([baseItem()], { role: 'admin' });
        renderEditor();
        await batchesLoaded();
        expect(screen.getByTestId('editor-margin')).toHaveTextContent('₹120.00');          // 60 x 2
        expect(screen.getByTestId('editor-margin')).toHaveTextContent('₹80.00 (40.0%)');   // 200 - 120
    });
});

describe('LineEditorSheet: remove with undo', () => {
    it('Remove deletes the line, shows "Removed NAME", and Undo puts the same line back', async () => {
        seed([baseItem({ discountPct: 10, totalAmount: 180 })]);
        renderEditor();
        await batchesLoaded();
        fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
        expect(cart()).toHaveLength(0);
        expect(screen.getByTestId('removed-snackbar')).toHaveTextContent('Removed DOLO 650 TAB');
        await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Batch' })).not.toBeInTheDocument());   // sheet closed

        fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
        expect(cart()).toHaveLength(1);
        expect(cart()[0]).toMatchObject({ batchId: 'b1', name: 'DOLO 650 TAB', qtyStrips: 2, discountPct: 10, totalAmount: 180 });
        expect(screen.queryByTestId('removed-snackbar')).not.toBeInTheDocument();
    });

    it('the snackbar goes away by itself', async () => {
        jest.useFakeTimers();
        try {
            seed([baseItem()]);
            renderEditor();
            fireEvent.click(await screen.findByRole('button', { name: /Remove/ }));
            expect(screen.getByTestId('removed-snackbar')).toBeInTheDocument();
            act(() => { jest.advanceTimersByTime(9000); });
            expect(screen.queryByTestId('removed-snackbar')).not.toBeInTheDocument();
            expect(cart()).toHaveLength(0);
        } finally {
            jest.useRealTimers();
        }
    });
});
