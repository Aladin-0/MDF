import React from 'react';
import { render, waitFor } from '@testing-library/react';

const replace = jest.fn();
let editParam: string | null = 'sale-1';
jest.mock('next/navigation', () => ({
    useSearchParams: () => ({ get: () => editParam }),
    useRouter: () => ({ replace }),
}));

const get = jest.fn();
jest.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a) } }));

import { EditSaleHydrator } from './EditSaleHydrator';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';

const invoice = (over: Record<string, unknown> = {}) => ({
    id: 'sale-1', invoiceDate: '2026-07-01T10:00:00', saleType: 'RETAIL', paymentMode: 'cash', amountPaid: 90, grandTotal: 90,
    updatedAt: '2026-07-01T10:05:00', extraDiscountPct: 0, customer: null,
    items: [{ productId: 'p1', batchId: 'b1', batchNo: 'B1', productName: 'Para', packSize: 10, qtyStrips: 1, qtyLoose: 0,
              mrp: 100, rate: 95, discountPct: 0, gstRate: 0 }],
    ...over,
});

function mockApi(inv: unknown, options: unknown = { allowedActions: ['commercial_correction'], invoice: { hasReturns: false, isPaid: false } }) {
    get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('modification-options') ? options : inv }));
}

beforeEach(() => {
    get.mockReset(); replace.mockReset();
    useBillingStore.getState().resetBilling?.();
    useAuthStore.setState({ user: { outlet: { id: 'o1' } } as never });
});

const cartOf = () => { const s = useBillingStore.getState(); return s.drafts[s.activeDraftId as string].cart; };

test('a hand-typed base rate is loaded back, not replaced by the MRP', async () => {
    mockApi(invoice());
    render(<EditSaleHydrator />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(cartOf()[0].rate).toBe(95);          // saved base rate, not the MRP of 100
});

test('the item discount and the bill discount are loaded back too', async () => {
    mockApi(invoice({ extraDiscountPct: 5, items: [{ ...invoice().items[0], rate: 100, discountPct: 10 }] }));
    render(<EditSaleHydrator />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(cartOf()[0].discountPct).toBe(10);
    const s = useBillingStore.getState();
    expect(s.drafts[s.activeDraftId as string].extraDiscountPct).toBe(5);
});

test('falls back to the MRP only when the saved rate is missing', async () => {
    mockApi(invoice({ items: [{ ...invoice().items[0], rate: 0 }] }));
    render(<EditSaleHydrator />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(cartOf()[0].rate).toBe(100);
});

test('marks the draft as an edit (with the version stamp and server-chosen action) only after loading', async () => {
    mockApi(invoice());
    render(<EditSaleHydrator />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const s = useBillingStore.getState();
    const d = s.drafts[s.activeDraftId as string];
    expect(d.editingSaleId).toBe('sale-1');
    expect(d.editingSaleUpdatedAt).toBe('2026-07-01T10:05:00');
    expect(d.revisionAction).toBe('commercial_correction');
});

test('a bill made for a family member loads back with that person as the patient', async () => {
    mockApi(invoice({ customer: { id: 'fam', name: 'Sharma Family Account', phone: '9876543210' }, patientId: 'm2', patientMemberName: 'Priya' }));
    render(<EditSaleHydrator />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const s = useBillingStore.getState();
    expect(s.drafts[s.activeDraftId as string].patient).toEqual({ id: 'm2', name: 'Priya' });
});

test('changing the customer clears the patient (they belonged to the previous account)', () => {
    const store = useBillingStore.getState();
    store.createDraft();
    store.setPatient({ id: 'm1', name: 'Rahul' });
    store.setCustomerLedger({ id: 'other', name: 'Someone' } as never);
    const s = useBillingStore.getState();
    expect(s.drafts[s.activeDraftId as string].patient).toBeNull();
});
