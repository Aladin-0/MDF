/**
 * Typing a bill discount into the desktop boxes, one key at a time: what the cashier sees after every key.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('uuid', () => ({ v4: () => `id-${Math.random().toString(36).slice(2)}` }));

import { RightBillingRail } from '../components/billing/RightBillingRail';
import { useBillingStore } from '../store/billingStore';

const store = () => useBillingStore.getState();

/** 3 x 204.50 less 10% (552.15) and 2 x 92.81 (185.62) = 737.77 */
beforeEach(() => {
    store().resetBilling();
    const id = store().createDraft();
    const line = (batchId: string, mrp: number, qty: number, discountPct: number) => store().addToCart(id, {
        batchId, productId: batchId, name: batchId, packSize: 1, qtyStrips: qty, qtyLoose: 0, totalQty: qty, mrp, saleRate: mrp,
        rate: mrp * (1 - discountPct / 100), discountPct, gstRate: 5, retailCostFloor: 10,
    } as any);
    line('a', 204.5, 3, 10);
    line('b', 92.81, 2, 0);
    render(<QueryClientProvider client={new QueryClient()}><RightBillingRail /></QueryClientProvider>);
});

const pctBox = () => document.querySelector('input[placeholder="0"]') as HTMLInputElement;
const rsBox = () => document.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
const total = () => String(Number(screen.getByTestId('grand-total-amount').textContent!.replace(/[^0-9.]/g, '')));
const type = (box: () => HTMLInputElement, text: string) => {
    act(() => { fireEvent.focus(box()); });
    for (let i = 1; i <= text.length; i++) act(() => { fireEvent.change(box(), { target: { value: text.slice(0, i) } }); });
};
const leave = (box: () => HTMLInputElement) => act(() => { fireEvent.blur(box()); });

it('no discount: 737.77, billed 738', () => {
    expect(total()).toBe('738');
});

it('percent typed key by key: 12.5% of 737.77 is 92.22, billed 646', () => {
    type(pctBox, '12.5');
    expect(pctBox()).toHaveValue('12.5');          // the box keeps what is typed
    expect(rsBox()).toHaveValue('92.22');
    expect(total()).toBe('646');                   // 645.55
    leave(pctBox);
    expect([pctBox().value, rsBox().value, total()]).toEqual(['12.5', '92.22', '646']);
});

it('rupees typed key by key: Rs 100 is Rs 100.00 (13.55%), billed 638, and stays after clicking around', () => {
    type(rsBox, '100');
    expect(rsBox()).toHaveValue('100');
    expect(pctBox()).toHaveValue('13.55');
    expect(total()).toBe('638');                   // 637.77
    leave(rsBox);
    expect(rsBox()).toHaveValue('100.00');
    act(() => { fireEvent.focus(pctBox()); }); leave(pctBox);
    act(() => { fireEvent.focus(rsBox()); }); leave(rsBox);
    expect([rsBox().value, total()]).toEqual(['100.00', '638']);
});

it('clicking from one box to the other and out changes nothing', () => {
    type(rsBox, '33.33'); leave(rsBox);
    for (const box of [pctBox, rsBox, pctBox]) { act(() => { fireEvent.focus(box()); }); leave(box); }
    expect(rsBox()).toHaveValue('33.33');
    expect(total()).toBe('704');                   // 704.44
});

it('clearing the box removes the discount', () => {
    type(rsBox, '50');
    act(() => { fireEvent.change(rsBox(), { target: { value: '' } }); });
    leave(rsBox);
    expect([pctBox().value, rsBox().value, total()]).toEqual(['', '', '738']);
});

it('a discount bigger than cost allows is cut, says so, and the bill can still be saved', () => {
    const id = store().activeDraftId as string;
    act(() => {
        store().updateCartItem(id, 'a', { retailCostFloor: 150 });
        store().updateCartItem(id, 'b', { retailCostFloor: 80 });
    });
    type(pctBox, '60'); leave(pctBox);
    const notes = screen.getAllByTestId('bill-discount-shortfall');
    expect(notes).toHaveLength(2);                 // the desktop summary, and the tablet dock (hidden on a desktop)
    notes.forEach((n) => expect(n).toHaveTextContent('Discount asked ₹442.66, given ₹97.27. More would sell items below cost.'));
    expect(notes.filter((n) => n.className.includes('lg:hidden'))).toHaveLength(1);
    expect(total()).toBe('641');                   // may not go under 3 x 157.50 + 2 x 84.00 = 640.50
    expect(screen.queryByTestId('loss-sale-lock-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-button')).toBeEnabled();
});
