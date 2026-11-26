/**
 * A bill discount typed in RUPEES stays that many rupees when the bill changes. It used to be turned into a percent the
 * moment it was typed, so Rs 100 off a Rs 500 bill silently became Rs 160 after adding a Rs 300 medicine.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => 'sale-1' }), useRouter: () => ({ push: jest.fn(), replace }) }));
const get = jest.fn();
jest.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
jest.mock('uuid', () => ({ v4: () => `id-${Math.random().toString(36).slice(2)}` }));

import { useBillingStore } from '../store/billingStore';
import { useAuthStore } from '../store/authStore';
import { buildSalePayload } from '../utils/payloadBuilders';
import { RightBillingRail } from '../components/billing/RightBillingRail';
import { TotalsSheet } from '../components/billing/mobile/TotalsSheet';
import { EditSaleHydrator } from '../components/billing/EditSaleHydrator';

const store = () => useBillingStore.getState();
const id = () => store().activeDraftId as string;
const totals = () => store().getDraftTotals(id());
const payload = () => buildSalePayload(store().drafts[id()], null, totals(), { id: 's' }, 'o');
const line = (batchId: string, price: number, qty = 1) => ({
    batchId, productId: batchId, name: batchId, packSize: 1, qtyStrips: qty, qtyLoose: 0, totalQty: qty, mrp: price, saleRate: price, rate: price,
    gstRate: 5, discountPct: 0, retailCostFloor: 1, wholesaleCostFloor: 1,
} as any);
const add = (batchId: string, price: number, qty = 1) => store().addToCart(id(), line(batchId, price, qty));
const given = () => totals().extraDiscountAmount;

beforeEach(() => {
    store().resetBilling();
    store().createDraft();
    get.mockReset(); replace.mockReset();
    useAuthStore.setState({ user: { outlet: { id: 'o1' } } as never });
});

describe('Rs 100 stays Rs 100', () => {
    beforeEach(() => { add('a', 500); store().setExtraDiscountRupees(100); });

    it('the example: 500 pays 400; add a 300 medicine and it pays 700, not 640', () => {
        expect(totals().grandTotal).toBe(400);
        add('b', 300);
        expect(given()).toBeCloseTo(100, 2);
        expect(totals().grandTotal).toBe(700);
        expect(payload().grandTotal).toBe(700);
        expect(payload().discountAmount).toBeCloseTo(100, 2);
        expect(payload().extraDiscountRupees).toBe(100);
        expect(payload().extraDiscountPct).toBeCloseTo(12.5, 6);       // the server still gets the matching percent
        expect(payload().items.reduce((n: number, i: any) => n + i.totalAmount, 0)).toBeCloseTo(700, 2);
    });

    it('when an item is removed', () => {
        add('b', 300);
        store().removeFromCart(id(), 'b');
        expect(given()).toBeCloseTo(100, 2);
        expect(totals().grandTotal).toBe(400);
    });

    it('when a quantity is changed', () => {
        store().updateCartItem(id(), 'a', { qtyStrips: 3, totalQty: 3 });
        expect(given()).toBeCloseTo(100, 2);
        expect(totals().grandTotal).toBe(1400);
    });

    it('when the bill is switched to wholesale', () => {
        store().setSaleType(id(), 'WHOLESALE');
        expect(given()).toBeCloseTo(100, 2);
    });

    it('through a page reload (the open bill is kept in the browser)', () => {
        const saved = JSON.parse(JSON.stringify(store().drafts));
        const active = id();
        store().resetBilling();
        store().setDrafts(saved, active);
        add('b', 300);
        expect(totals().grandTotal).toBe(700);
    });

    it('a bill smaller than the discount takes what it can and says what was asked; it comes back when the bill grows', () => {
        store().removeFromCart(id(), 'a');
        add('c', 60);
        expect(given()).toBeLessThanOrEqual(60);
        expect(totals().extraDiscountAmount + (totals().extraDiscountShortfall ?? 0)).toBeCloseTo(100, 2);
        add('b', 300);
        expect(given()).toBeCloseTo(100, 2);
        expect(totals().extraDiscountShortfall).toBe(0);
    });

    it('an emptied bill shows no discount and no message', () => {
        store().removeFromCart(id(), 'a');
        expect(given()).toBe(0);
        expect(totals().extraDiscountShortfall).toBe(0);
    });

    it('typing a percent replaces it; a percent still grows with the bill', () => {
        store().setExtraDiscountPct(10);
        expect(given()).toBeCloseTo(50, 2);
        add('b', 300);
        expect(given()).toBeCloseTo(80, 2);
        expect(payload().extraDiscountRupees).toBeNull();
    });

    it('clearing the bill forgets it', () => {
        store().clearCart(id());
        add('a', 500);
        expect(given()).toBe(0);
    });

    it('a percent set by loading a quotation or repeating an order replaces it', () => {
        store().updateDraftHeader(id(), { extraDiscountPct: 5 });
        expect(given()).toBeCloseTo(25, 2);
    });
});

it('random bills: whatever is added after typing rupees, exactly those rupees come off', () => {
    let seed = 3;
    const rnd = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n; };
    for (let run = 0; run < 300; run++) {
        store().resetBilling();
        store().createDraft();
        if (run % 3 === 0) store().setSaleType(id(), 'WHOLESALE');
        add('a', (20000 + rnd(30000)) / 100);
        const typed = (1 + rnd(15000)) / 100;
        store().setExtraDiscountRupees(typed);
        for (let i = 0; i < 1 + rnd(5); i++) {
            add(`x${i}`, (500 + rnd(90000)) / 100, 1 + rnd(4));
            expect(Math.round(given() * 100)).toBe(Math.round(typed * 100));
        }
    }
});

describe.each([
    ['desktop', () => <RightBillingRail />, () => document.querySelector('input[placeholder="0.00"]') as HTMLInputElement],
    ['phone', () => <TotalsSheet open onClose={() => {}} />, () => screen.getByTestId('bill-discount-amt') as HTMLInputElement],
])('typing in the %s rupee box', (_name, view, box) => {
    it('keeps showing 100 after another medicine is added', () => {
        add('a', 500);
        render(<QueryClientProvider client={new QueryClient()}>{view()}</QueryClientProvider>);
        act(() => { fireEvent.focus(box()); });
        for (const v of ['1', '10', '100']) act(() => { fireEvent.change(box(), { target: { value: v } }); });
        act(() => { fireEvent.blur(box()); });
        act(() => { add('b', 300); });
        expect(box()).toHaveValue('100.00');
        expect(totals().grandTotal).toBe(700);
    });
});

describe('modifying a saved bill', () => {
    const saved = (over: Record<string, unknown>) => ({
        id: 'sale-1', invoiceDate: '2026-07-01T10:00:00', saleType: 'RETAIL', paymentMode: 'cash', amountPaid: 400, grandTotal: 400,
        updatedAt: '2026-07-01T10:05:00', customer: null, extraDiscountPct: 20,
        items: [{ productId: 'a', batchId: 'a', batchNo: 'B1', name: 'a', packSize: 1, qtyStrips: 1, qtyLoose: 0, mrp: 500, rate: 500, discountPct: 0,
                  gstRate: 5, totalAmount: 400, retailCostFloor: 1 }],
        ...over,
    });
    async function open(inv: unknown) {
        store().resetBilling();
        get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('modification-options') ? { allowedActions: ['commercial_correction'] } : inv }));
        render(<EditSaleHydrator />);
        await waitFor(() => expect(replace).toHaveBeenCalled());
    }

    it('a rupee discount comes back in rupees and stays when a medicine is added', async () => {
        await open(saved({ extraDiscountRupees: 100 }));
        add('b', 300);
        expect(totals().grandTotal).toBe(700);
    });

    it('a rupee discount too small to show as a percent is taken off once, not twice', async () => {
        // Rs 5 off a Rs 1,20,000 line is 0.004%: saved as 0.00
        await open(saved({ extraDiscountPct: 0, extraDiscountRupees: 5, grandTotal: 119995,
            items: [{ ...saved({}).items[0], mrp: 1200, rate: 1200, qtyStrips: 100, totalAmount: 119995 }] }));
        expect(totals().preExtraNet).toBeCloseTo(120000, 2);
        expect(totals().grandTotal).toBe(119995);
    });

    it('a percent discount comes back as a percent', async () => {
        await open(saved({ extraDiscountRupees: null }));
        add('b', 300);
        expect(totals().grandTotal).toBe(640);
    });
});
