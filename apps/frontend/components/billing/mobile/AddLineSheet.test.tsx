import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddLineSheet } from './AddLineSheet';
import { useBillingStore } from '../../../store/billingStore';

jest.mock('../../../store/billingStore', () => ({ useBillingStore: jest.fn() }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));

const batch = (id: string, extra: any = {}) => ({
    id, batchNo: `B-${id}`, expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip', ...extra,
});
const product = (batches: any[], extra: any = {}): any => ({
    id: 'p1', name: 'DOLO 650 TAB', composition: 'PARACETAMOL', manufacturer: 'Mfg', gstRate: 12, packSize: 10, packUnit: 'tablet', packType: 'strip',
    scheduleType: 'OTC', mrp: 100, totalStock: 10, isLowStock: false, hasStock: true, batches, ...extra,
});

let addToCart: jest.Mock;
function setup(p: any, saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL') {
    addToCart = jest.fn();
    (useBillingStore as unknown as jest.Mock).mockReturnValue({
        activeDraftId: 'draft-1',
        drafts: { 'draft-1': { cart: [], saleType } },
        addToCart,
    });
    const onClose = jest.fn();
    const onAdded = jest.fn();
    render(<AddLineSheet product={p} onClose={onClose} onAdded={onAdded} />);
    return { onClose, onAdded };
}

describe('AddLineSheet', () => {
    it('renders nothing without a product', () => {
        setup(null);
        expect(screen.queryByTestId('add-to-bill')).not.toBeInTheDocument();
    });

    it('a single valid batch is pre-selected (expired and empty batches are shown but disabled)', () => {
        setup(product([batch('b1'), batch('b2', { expiryDate: '2020-01-31' }), batch('b3', { qtyStrips: 0, qtyLoose: 0 })]));
        expect(screen.getByTestId('batch-chip-b1')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('batch-chip-b2')).toBeDisabled();
        expect(screen.getByTestId('batch-chip-b2')).toHaveTextContent('Expired');
        expect(screen.getByTestId('batch-chip-b3')).toBeDisabled();
        expect(screen.getByTestId('batch-chip-b3')).toHaveTextContent('No stock');
        expect(screen.getByTestId('quick-qty-strips')).toBeInTheDocument();
        expect(screen.getByTestId('add-to-bill')).toBeEnabled();
    });

    it('with several valid batches nothing is selected until one is tapped', () => {
        setup(product([batch('b1'), batch('b2', { batchNo: 'B-OTHER', expiryDate: '2098-06-30' })]));
        expect(screen.getByTestId('add-to-bill')).toBeDisabled();
        expect(screen.getByText('Tap a batch to continue.')).toBeInTheDocument();
        expect(screen.getByTestId('batch-chip-b2')).toHaveTextContent('Exp: 06/98');
        fireEvent.click(screen.getByTestId('batch-chip-b2'));
        expect(screen.getByTestId('batch-chip-b2')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('add-to-bill')).toBeEnabled();
    });

    it('the loose stepper exists when the pack allows loose selling', () => {
        setup(product([batch('b1')]));
        expect(screen.getByTestId('quick-qty-loose')).toBeInTheDocument();
    });

    it('no loose stepper for a pack that cannot be sold loose', () => {
        setup(product([batch('b1', { packType: 'bottle', packSize: 1, allowsLoose: false })], { packType: 'bottle', packSize: 1 }));
        expect(screen.queryByTestId('quick-qty-loose')).not.toBeInTheDocument();
        expect(screen.getByTestId('quick-qty-strips')).toBeInTheDocument();
    });

    it('adding 2 strips builds the right line, calls addToCart for the active bill, then closes and reports', () => {
        const { onClose, onAdded } = setup(product([batch('b1')]));
        fireEvent.change(screen.getByTestId('quick-qty-strips'), { target: { value: '2' } });
        fireEvent.change(screen.getByTestId('add-line-discount'), { target: { value: '10' } });
        expect(screen.getByTestId('add-line-total')).toHaveTextContent('₹180.00');          // 2 x 100 less 10%
        fireEvent.click(screen.getByTestId('add-to-bill'));

        expect(addToCart).toHaveBeenCalledTimes(1);
        const [draftId, item] = addToCart.mock.calls[0];
        expect(draftId).toBe('draft-1');
        expect(item).toMatchObject({ productId: 'p1', batchId: 'b1', name: 'DOLO 650 TAB', qtyStrips: 2, qtyLoose: 0, rate: 90, saleRate: 100, discountPct: 10, totalAmount: 180 });   // rate is the NET price after the discount
        expect(onAdded).toHaveBeenCalledWith('DOLO 650 TAB', 'x2');
        expect(onClose).toHaveBeenCalled();
    });

    it('loose units count: 1 strip + 3 loose', () => {
        const { onAdded } = setup(product([batch('b1')]));
        fireEvent.change(screen.getByTestId('quick-qty-loose'), { target: { value: '3' } });
        expect(screen.getByTestId('add-line-total')).toHaveTextContent('₹130.00');
        fireEvent.click(screen.getByTestId('add-to-bill'));
        expect(addToCart.mock.calls[0][1]).toMatchObject({ qtyStrips: 1, qtyLoose: 3 });
        expect(onAdded).toHaveBeenCalledWith('DOLO 650 TAB', 'x1 + 3 loose');
    });

    it('more than the batch holds shows a red inline message and adds nothing (no alert)', () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
        const { onClose } = setup(product([batch('b1', { qtyStrips: 2 })]));
        fireEvent.change(screen.getByTestId('quick-qty-strips'), { target: { value: '5' } });
        expect(screen.getByTestId('add-line-error')).toHaveTextContent('exceeds available stock');
        fireEvent.click(screen.getByTestId('add-to-bill'));
        expect(addToCart).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
        alertSpy.mockRestore();
    });

    it('quantity 0 gives an inline hint only after tapping Add to bill', () => {
        setup(product([batch('b1')]));
        fireEvent.change(screen.getByTestId('quick-qty-strips'), { target: { value: '0' } });
        expect(screen.queryByTestId('add-line-hint')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('add-to-bill'));
        expect(screen.getByTestId('add-line-hint')).toBeInTheDocument();
        expect(addToCart).not.toHaveBeenCalled();
    });

    it('wholesale: PTS / PTR / MRP chips with the rate in use highlighted, and the line uses PTS', () => {
        setup(product([batch('b1')]), 'WHOLESALE');
        expect(screen.getByTestId('rate-PTS')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('rate-PTR')).toHaveAttribute('data-active', 'false');
        expect(screen.getByTestId('rate-MRP')).toHaveAttribute('data-active', 'false');
        fireEvent.click(screen.getByTestId('add-to-bill'));
        expect(addToCart.mock.calls[0][1]).toMatchObject({ rate: 70, saleRate: 70 });
    });

    it('wholesale falls back to PTR when the batch has no PTS', () => {
        setup(product([batch('b1', { pts: 0 })]), 'WHOLESALE');
        expect(screen.getByTestId('rate-PTR')).toHaveAttribute('data-active', 'true');
    });

    it('retail shows no rate chips', () => {
        setup(product([batch('b1')]));
        expect(screen.queryByTestId('rate-chips')).not.toBeInTheDocument();
    });

    it('the discount field is labelled and uses the decimal keypad', () => {
        setup(product([batch('b1')]));
        const field = screen.getByLabelText('Discount %');
        expect(field).toHaveAttribute('inputmode', 'decimal');
        fireEvent.change(field, { target: { value: '250' } });
        expect((field as HTMLInputElement).value).toBe('100');
    });
});

describe('AddLineSheet: the new cart card needs no network call', () => {
    it('adding a line puts the product and its batches in the cache the cart card reads', () => {
        addToCart = jest.fn();
        (useBillingStore as unknown as jest.Mock).mockReturnValue({ activeDraftId: 'draft-1', drafts: { 'draft-1': { cart: [], saleType: 'RETAIL' } }, addToCart });
        const client = new QueryClient();
        const p = product([batch('b1')]);
        render(<QueryClientProvider client={client}><AddLineSheet product={p} onClose={jest.fn()} onAdded={jest.fn()} /></QueryClientProvider>);
        fireEvent.click(screen.getByTestId('add-to-bill'));
        const cached: any = client.getQueryData(['product', 'search', 'DOLO 650 TAB', 'outlet-1']);
        expect(cached).toHaveLength(1);
        expect(cached[0].id).toBe('p1');
        expect(cached[0].batches[0].id).toBe('b1');
    });
});

describe('AddLineSheet: one Add button, and it says when the batch is already in the bill', () => {
    function setupWithCart(cart: any[]) {
        addToCart = jest.fn();
        (useBillingStore as unknown as jest.Mock).mockReturnValue({ activeDraftId: 'draft-1', drafts: { 'draft-1': { cart, saleType: 'RETAIL' } }, addToCart });
        render(<AddLineSheet product={product([batch('b1')])} onClose={jest.fn()} onAdded={jest.fn()} />);
    }

    it('offers a single add action (no second "add and search" button)', () => {
        setupWithCart([]);
        expect(screen.getByTestId('add-to-bill')).toBeInTheDocument();
        expect(screen.queryByTestId('add-and-search-next')).not.toBeInTheDocument();
        expect(screen.getAllByRole('button').filter((b) => /add/i.test(b.textContent || ''))).toHaveLength(1);
    });

    it('a batch not in the bill has no "already in the bill" note', () => {
        setupWithCart([]);
        expect(screen.queryByTestId('already-in-bill')).not.toBeInTheDocument();
    });

    it('a batch already in the bill says how much and that adding increases it', () => {
        setupWithCart([{ batchId: 'b1', productId: 'p1', qtyStrips: 2, qtyLoose: 0, packType: 'strip' }]);
        expect(screen.getByTestId('already-in-bill')).toHaveTextContent('Already in the bill: 2 strips. This adds more to it.');
    });
});
