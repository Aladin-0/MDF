import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PaymentView } from './PaymentView';
import { useBillingStore } from '@/store/billingStore';

// A small real (zustand) store with the same shape PaymentView reads, so typing and Fill flow through like in the app
jest.mock('@/store/billingStore', () => {
    const { create } = require('zustand');
    const useBillingStore = create((set: any, get: any) => ({
        drafts: {}, activeDraftId: 'd1', landingCostIncludeGst: false,
        getDraftTotals: () => ({ grandTotal: 1000, itemCount: 1 }),
        setPayment: (u: any) => set((s: any) => ({ drafts: { ...s.drafts, d1: { ...s.drafts.d1, payment: { ...s.drafts.d1.payment, ...u } } } })),
        setRevisionContext: jest.fn(),
    }));
    return { useBillingStore };
});
jest.mock('@/lib/billingMarginUtils', () => ({ calculateLineMargin: (item: any) => ({ isLossSale: Boolean(item.loss) }) }));

const customer = (extra: any = {}) => ({ id: 'c1', name: 'Asha Medicals', outstanding: 1000, creditLimit: 5000, ...extra });
const baseDraft = (extra: any = {}) => ({
    documentMode: 'invoice', saleType: 'RETAIL', cart: [{ id: 'a' }], customer: null, extraDiscountPct: 0,
    payment: { method: 'cash', amount: 0 }, ...extra,
});
function seed(extra: any = {}) {
    (useBillingStore as any).setState({ drafts: { d1: baseDraft(extra) }, activeDraftId: 'd1' });
}

/** Mirrors the flags useCheckout derives (kept tiny on purpose) */
function makeCheckout(over: any = {}) {
    const d = (useBillingStore as any).getState().drafts.d1;
    const total = 1000;
    const method = d.payment.method;
    const tender = d.payment.cashTendered;
    const sb = d.payment.splitBreakdown || { cash: 0, upi: 0, card: 0, credit: 0 };
    const splitTotal = Number((sb.cash + sb.upi + sb.card + sb.credit).toFixed(2));
    const isTenderInvalid = method === 'cash' && !!tender && tender < total;
    const isSplitInvalid = method === 'split' && Math.abs(splitTotal - total) > 0.01;
    const isCreditInvalid = method === 'credit' && !d.customer;
    const base = {
        handleCheckout: jest.fn(), executeCheckout: jest.fn(), setReasonModalOpen: jest.fn(),
        canCheckout: d.cart.length > 0 && !isTenderInvalid && !isSplitInvalid && !isCreditInvalid,
        checkoutError: null, reasonModalOpen: false, isLoading: false,
        balance: Math.max(0, (tender || total) - total),
        isScheduleHValid: true, isTenderInvalid, isCreditInvalid, splitTotal, isSplitInvalid,
        isSplitCreditInvalid: false, isLossSale: false, isGlobalLoss: false,
    };
    return { ...base, ...over } as any;
}

function Harness({ over, onFix = jest.fn(), checkoutRef }: { over?: any; onFix?: any; checkoutRef?: { current: any } }) {
    const state = (useBillingStore as any)();      // re-render on every store change, like the app
    void state;
    const checkout = makeCheckout(over);
    if (checkoutRef) checkoutRef.current = checkout;
    return <PaymentView open onClose={jest.fn()} checkout={checkout} onFix={onFix} />;
}

beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
    Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }) });
});

const payment = () => (useBillingStore as any).getState().drafts.d1.payment;
const setOnline = (online: boolean) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });

describe('PaymentView: one tap on how the customer pays saves the bill', () => {
    afterEach(() => setOnline(true));

    it('shows the total in the title, Cash / UPI / Card, On credit and a Split option, and no "Received" field', () => {
        seed();
        render(<Harness />);
        expect(screen.getByText('Payment')).toBeInTheDocument();
        expect(screen.getByTestId('payment-total')).toHaveTextContent('₹1,000.00');
        ['pay-cash', 'pay-upi', 'pay-card'].forEach((id) => expect(screen.getByTestId(id).className).toContain('min-h-[72px]'));
        expect(screen.getByTestId('pay-credit')).toBeInTheDocument();
        expect(screen.getByTestId('pay-split-toggle')).toBeInTheDocument();
        expect(screen.queryByLabelText(/received/i)).not.toBeInTheDocument();
        expect(screen.queryByTestId('payment-change')).not.toBeInTheDocument();
        expect(screen.queryByTestId('payment-collect-button')).not.toBeInTheDocument();   // no second "Collect" step
    });

    it.each(['cash', 'upi', 'card'] as const)('tapping %s saves right away with that method', (mode) => {
        seed();
        const handleCheckout = jest.fn();
        render(<Harness over={{ handleCheckout }} />);
        fireEvent.click(screen.getByTestId(`pay-${mode}`));
        expect(payment().method).toBe(mode);
        expect(handleCheckout).toHaveBeenCalledTimes(1);
    });

    it('opens as plain Cash and drops any "received" amount left on the bill', () => {
        seed({ payment: { method: 'split', amount: 0, cashTendered: 5000, splitBreakdown: { cash: 1, upi: 1, card: 0, credit: 0 } } });
        render(<Harness />);
        expect(payment().method).toBe('cash');
        expect(payment().cashTendered).toBeUndefined();
    });

    it('On credit with a customer shows who and what they owe, and saves as credit', () => {
        seed({ customer: customer() });
        const handleCheckout = jest.fn();
        render(<Harness over={{ handleCheckout }} />);
        const btn = screen.getByTestId('pay-credit');
        expect(btn).toHaveTextContent('Asha Medicals');
        expect(btn).toHaveTextContent('Due ₹1,000.00');
        expect(btn).toHaveTextContent('limit ₹5,000.00');
        fireEvent.click(btn);
        expect(payment().method).toBe('credit');
        expect(handleCheckout).toHaveBeenCalledTimes(1);
    });

    it('On credit without a customer asks to pick one instead of saving', () => {
        seed();
        const handleCheckout = jest.fn();
        const onFix = jest.fn();
        render(<Harness over={{ handleCheckout }} onFix={onFix} />);
        expect(screen.getByTestId('pay-credit')).toHaveTextContent('Select a customer first');
        fireEvent.click(screen.getByTestId('pay-credit'));
        expect(onFix).toHaveBeenCalledWith('customer');
        expect(handleCheckout).not.toHaveBeenCalled();
    });

    it('while saving every payment button is disabled (no double bill)', () => {
        seed();
        render(<Harness over={{ isLoading: true }} />);
        ['pay-cash', 'pay-upi', 'pay-card', 'pay-credit'].forEach((id) => expect(screen.getByTestId(id)).toBeDisabled());
    });

    it('shows the save error inline', () => {
        seed();
        render(<Harness over={{ checkoutError: 'Security Block: Invalid Round Off' }} />);
        expect(screen.getByTestId('payment-error')).toHaveTextContent('Invalid Round Off');
    });
});

describe('PaymentView: checks that stop a payment', () => {
    afterEach(() => setOnline(true));

    it('a failing check is a tappable row that sends you to the fix, and the payment buttons are off', () => {
        seed({ customer: null });
        const onFix = jest.fn();
        render(<Harness over={{ isScheduleHValid: false, canCheckout: false }} onFix={onFix} />);
        ['pay-cash', 'pay-upi', 'pay-card'].forEach((id) => expect(screen.getByTestId(id)).toBeDisabled());
        fireEvent.click(screen.getByTestId('check-scheduleH'));
        expect(onFix).toHaveBeenCalledWith('doctor');
    });

    it('a loss-making line points to the cart', () => {
        seed({ cart: [{ id: 'a', loss: true }] });
        const onFix = jest.fn();
        render(<Harness over={{ isLossSale: true, canCheckout: false }} onFix={onFix} />);
        fireEvent.click(screen.getByTestId('check-loss'));
        expect(onFix).toHaveBeenCalledWith('cart');
    });

    it('offline shows a plain row and blocks every payment button', () => {
        setOnline(false);
        seed();
        render(<Harness />);
        const row = screen.getByTestId('check-offline');
        expect(row.tagName).not.toBe('BUTTON');
        ['pay-cash', 'pay-upi', 'pay-card'].forEach((id) => expect(screen.getByTestId(id)).toBeDisabled());
    });

    it('with nothing wrong there is no checks list', () => {
        seed();
        render(<Harness />);
        expect(screen.queryByLabelText('Checks')).not.toBeInTheDocument();
        ['pay-cash', 'pay-upi', 'pay-card'].forEach((id) => expect(screen.getByTestId(id)).toBeEnabled());
    });
});

describe('PaymentView: split', () => {
    it('Split starts with the whole total in Cash and has four decimal inputs', () => {
        seed();
        render(<Harness />);
        fireEvent.click(screen.getByTestId('pay-split-toggle'));
        expect(payment().method).toBe('split');
        expect(payment().splitBreakdown).toEqual({ cash: 1000, upi: 0, card: 0, credit: 0 });
        ['Cash', 'UPI', 'Card', 'Credit'].forEach((l) => expect(screen.getByLabelText(l)).toHaveAttribute('inputmode', 'decimal'));
        expect(screen.getByTestId('payment-split-status')).toHaveTextContent('Exact match');
    });

    it('typing shows what is remaining, Fill remaining completes it, then Collect is available', () => {
        seed();
        const handleCheckout = jest.fn();
        render(<Harness over={{ handleCheckout }} />);
        fireEvent.click(screen.getByTestId('pay-split-toggle'));
        fireEvent.change(screen.getByLabelText('Cash'), { target: { value: '400' } });
        expect(screen.getByTestId('payment-split-status')).toHaveTextContent('Remaining ₹600.00');
        expect(screen.getByTestId('payment-split-collect')).toBeDisabled();

        fireEvent.click(screen.getByLabelText('Fill remaining in UPI'));
        expect(screen.getByTestId('payment-split-status')).toHaveTextContent('Exact match');
        expect(screen.getByTestId('payment-split-collect')).toBeEnabled();
        fireEvent.click(screen.getByTestId('payment-split-collect'));
        expect(handleCheckout).toHaveBeenCalledTimes(1);
    });

    it('overpaying says Overpaid and blocks Collect', () => {
        seed();
        render(<Harness />);
        fireEvent.click(screen.getByTestId('pay-split-toggle'));
        fireEvent.change(screen.getByLabelText('Cash'), { target: { value: '1200' } });
        expect(screen.getByTestId('payment-split-status')).toHaveTextContent('Overpaid by ₹200.00');
        expect(screen.getByTestId('payment-split-collect')).toBeDisabled();
    });

    it('the single-tap buttons are off while the split form is open', () => {
        seed();
        render(<Harness />);
        fireEvent.click(screen.getByTestId('pay-split-toggle'));
        ['pay-cash', 'pay-upi', 'pay-card'].forEach((id) => expect(screen.getByTestId(id)).toBeDisabled());
    });

    it('closing Split goes back to plain Cash', () => {
        seed();
        render(<Harness />);
        fireEvent.click(screen.getByTestId('pay-split-toggle'));
        fireEvent.click(screen.getByTestId('pay-split-toggle'));
        expect(payment().method).toBe('cash');
        expect(screen.queryByLabelText('Split payment')).not.toBeInTheDocument();
    });
});

describe('PaymentView: modifying a saved bill', () => {
    const edited = (method: string, extra: any = {}) => seed({ editingSaleId: 'sale-1', payment: { method, amount: 0 }, ...extra });

    it('starts on the bill\'s own mode, says so, and does not reset it to Cash', () => {
        edited('upi');
        render(<Harness />);
        expect(payment().method).toBe('upi');
        expect(screen.getByTestId('payment-current')).toHaveTextContent('Currently paid by UPI');
        expect(screen.getByTestId('pay-upi')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('pay-cash')).toHaveAttribute('aria-pressed', 'false');
    });

    it('tapping a mode only selects it: nothing is saved until Save changes is pressed', () => {
        edited('upi');
        const ref: any = { current: null };
        render(<Harness checkoutRef={ref} />);
        fireEvent.click(screen.getByTestId('pay-card'));
        expect(payment().method).toBe('card');
        expect(ref.current.handleCheckout).not.toHaveBeenCalled();
        expect(screen.getByTestId('payment-current')).toHaveTextContent('Currently paid by UPI');   // still the saved one
        expect(screen.getByTestId('payment-edit-save')).toHaveTextContent('Save changes · Card · ₹1,000.00');
        fireEvent.click(screen.getByTestId('payment-edit-save'));
        expect(ref.current.handleCheckout).toHaveBeenCalledTimes(1);
    });

    it('a bill saved on credit can be changed to cash', () => {
        edited('credit', { customer: customer() });
        const ref: any = { current: null };
        render(<Harness checkoutRef={ref} />);
        expect(screen.getByTestId('pay-credit')).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByTestId('pay-cash'));
        fireEvent.click(screen.getByTestId('payment-edit-save'));
        expect(payment().method).toBe('cash');
        expect(ref.current.handleCheckout).toHaveBeenCalled();
    });

    it('credit with no customer cannot be saved', () => {
        edited('credit');
        render(<Harness />);
        expect(screen.getByTestId('payment-edit-save')).toBeDisabled();
    });

    it('a split bill opens with its split showing and a Save changes button', () => {
        edited('split', { payment: { method: 'split', amount: 0, splitBreakdown: { cash: 600, upi: 400, card: 0, credit: 0 } } });
        render(<Harness />);
        expect(screen.getByLabelText('Split payment')).toBeInTheDocument();
        expect(payment().method).toBe('split');
        expect(screen.getByTestId('payment-split-collect')).toHaveTextContent('Save changes ₹1,000.00');
        expect(screen.queryByTestId('payment-edit-save')).not.toBeInTheDocument();
    });

    it('a NEW bill is unchanged: no "Currently", no Save button, tapping a mode saves', () => {
        seed();
        const ref: any = { current: null };
        render(<Harness checkoutRef={ref} />);
        expect(screen.queryByTestId('payment-current')).not.toBeInTheDocument();
        expect(screen.queryByTestId('payment-edit-save')).not.toBeInTheDocument();
        expect(screen.getByTestId('pay-cash')).not.toHaveAttribute('aria-pressed');
    });
});

