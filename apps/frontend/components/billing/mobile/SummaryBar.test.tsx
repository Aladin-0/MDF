import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SummaryBar } from './SummaryBar';
import { useBillingStore } from '@/store/billingStore';

const line = (batchId: string, qtyStrips: number, qtyLoose: number, amount: number): any => ({
    batchId, productId: `p-${batchId}`, name: `MED ${batchId}`, packSize: 10, packUnit: 'tablet', packType: 'strip', batchNo: 'B', expiryDate: '2099-12-31',
    scheduleType: 'OTC', mrp: amount, rate: amount, qtyStrips, qtyLoose, totalQty: qtyStrips + qtyLoose / 10, saleMode: 'strip', discountPct: 0, gstRate: 0,
    taxableAmount: amount, gstAmount: 0, totalAmount: amount,
});

function seed(cart: any[]) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], cart } } }));
}
const props = (extra: any = {}) => ({ label: 'Collect ₹1,038', disabledReason: null, submitting: false, onCollect: jest.fn(), onOpenTotals: jest.fn(), ...extra });

describe('SummaryBar', () => {
    beforeEach(() => seed([line('a', 2, 0, 100), line('b', 3, 4, 50)]));

    it('shows items, packs, the net payable from the store and the main button label', () => {
        render(<SummaryBar {...props()} />);
        expect(screen.getByTestId('summary-items')).toHaveTextContent('2 items · 5 packs + 4 loose');
        expect(screen.getByTestId('grand-total-amount')).toHaveTextContent('₹');
        expect(screen.getByTestId('checkout-button')).toHaveTextContent('Collect ₹1,038');
        expect(screen.getByTestId('checkout-button')).toBeEnabled();
        expect(screen.queryByTestId('checkout-disabled-reason')).not.toBeInTheDocument();
    });

    it('the total is the bill total', () => {
        seed([line('a', 1, 0, 100), line('b', 1, 0, 50)]);
        render(<SummaryBar {...props()} />);
        expect(screen.getByTestId('grand-total-amount')).toHaveTextContent('₹150.00');
    });

    it('click on the main button collects', () => {
        const p = props();
        render(<SummaryBar {...p} />);
        fireEvent.click(screen.getByTestId('checkout-button'));
        expect(p.onCollect).toHaveBeenCalledTimes(1);
    });

    it('a disabled reason shows as one line and disables the button', () => {
        const p = props({ disabledReason: 'Customer needed for credit' });
        render(<SummaryBar {...p} />);
        expect(screen.getByTestId('checkout-disabled-reason')).toHaveTextContent('Customer needed for credit');
        const btn = screen.getByTestId('checkout-button');
        expect(btn).toBeDisabled();
        fireEvent.click(btn);
        expect(p.onCollect).not.toHaveBeenCalled();
    });

    it('while submitting the button is busy and cannot be pressed twice', () => {
        const p = props({ submitting: true });
        render(<SummaryBar {...p} />);
        const btn = screen.getByTestId('checkout-button');
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('aria-busy', 'true');
        expect(btn.querySelector('svg.animate-spin')).not.toBeNull();
        fireEvent.click(btn);
        expect(p.onCollect).not.toHaveBeenCalled();
    });

    it('tapping the total opens the totals sheet', () => {
        const p = props();
        render(<SummaryBar {...p} />);
        fireEvent.click(screen.getByRole('button', { name: 'Show bill totals' }));
        expect(p.onOpenTotals).toHaveBeenCalledTimes(1);
    });
});

describe('SummaryBar and the on-screen keyboard', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    let listeners: Record<string, Array<() => void>>;
    let vv: any;

    beforeEach(() => {
        seed([line('a', 1, 0, 100)]);
        listeners = {};
        vv = {
            height: 800,
            addEventListener: (type: string, fn: () => void) => { (listeners[type] ||= []).push(fn); },
            removeEventListener: (type: string, fn: () => void) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
        };
        Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
        Object.defineProperty(window, 'visualViewport', { configurable: true, writable: true, value: vv });
    });
    afterEach(() => {
        if (original) Object.defineProperty(window, 'visualViewport', original);
        else delete (window as any).visualViewport;
    });
    const resizeTo = (h: number) => act(() => { vv.height = h; (listeners.resize || []).forEach((f) => f()); });

    it('hides while a field is focused and the keyboard has shrunk the viewport, and comes back after', () => {
        render(<><input aria-label="search" /><SummaryBar {...props()} /></>);
        const bar = screen.getByTestId('summary-bar');
        expect(bar).toBeVisible();
        const input = screen.getByLabelText('search');
        input.focus();
        resizeTo(450);
        expect(bar).not.toBeVisible();
        act(() => { input.blur(); });
        resizeTo(800);
        expect(bar).toBeVisible();
    });

    it('stays visible when the viewport shrinks but no field has focus (browser bar, not a keyboard)', () => {
        render(<SummaryBar {...props()} />);
        resizeTo(450);
        expect(screen.getByTestId('summary-bar')).toBeVisible();
    });

    it('does not break when there is no visualViewport (jsdom, old browsers)', () => {
        delete (window as any).visualViewport;
        render(<SummaryBar {...props()} />);
        expect(screen.getByTestId('summary-bar')).toBeVisible();
    });
});
