import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TotalsSheet } from './TotalsSheet';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';

// one line: 2 packs x Rs 500, 12% GST inside the price -> net 1000
const line = (extra: any = {}): any => ({
    batchId: 'b1', productId: 'p1', name: 'DOLO', packSize: 10, packUnit: 'tablet', packType: 'strip', batchNo: 'B', expiryDate: '2099-12-31', scheduleType: 'OTC',
    mrp: 500, saleRate: 500, rate: 500, landingRate: 300, purchaseRate: 280, qtyStrips: 2, qtyLoose: 0, totalQty: 2, saleMode: 'strip', discountPct: 0, gstRate: 12,
    taxableAmount: 892.86, gstAmount: 107.14, totalAmount: 1000, ...extra,
});

let draftId = '';
function seed(opts: { role?: string; saleType?: 'RETAIL' | 'WHOLESALE'; customerState?: string; outletState?: string; showMarginInfo?: boolean; cart?: any[] } = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    draftId = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({
        drafts: {
            ...s.drafts,
            [draftId]: {
                ...s.drafts[draftId],
                cart: opts.cart ?? [line()],
                saleType: opts.saleType ?? 'RETAIL',
                customer: opts.customerState ? { id: 'c1', name: 'Cust', state: opts.customerState } : null,
            } as any,
        },
        activeStaff: { id: 's1', name: 'Staff', role: opts.role ?? 'admin', maxDiscount: 100, canEditRate: false } as any,
        showMarginInfo: opts.showMarginInfo ?? true,
    }));
    useAuthStore.setState({ outlet: opts.outletState ? ({ id: 'o1', state: opts.outletState } as any) : null });
}
const draft = () => useBillingStore.getState().drafts[draftId];
const open = () => render(<TotalsSheet open onClose={jest.fn()} />);
const pct = () => screen.getByTestId('bill-discount-pct') as HTMLInputElement;
const amt = () => screen.getByTestId('bill-discount-amt') as HTMLInputElement;

describe('TotalsSheet: lines', () => {
    it('shows every desktop line for a retail bill and nothing when closed', () => {
        seed({ outletState: 'Maharashtra', customerState: 'Maharashtra' });
        const { unmount } = open();
        expect(screen.getByTestId('totals-item-count')).toHaveTextContent('1');
        expect(screen.getByTestId('totals-item-discount')).toBeInTheDocument();
        expect(screen.getByTestId('totals-bill-discount')).toHaveTextContent('₹ 0.00');
        expect(screen.getByTestId('totals-taxable')).toHaveTextContent('₹ 892.86');
        expect(screen.getByTestId('totals-round-off')).toBeInTheDocument();
        expect(screen.getByTestId('totals-net-payable')).toHaveTextContent('₹ 1000.00');
        unmount();
        render(<TotalsSheet open={false} onClose={jest.fn()} />);
        expect(screen.queryByTestId('totals-net-payable')).not.toBeInTheDocument();
    });

    it('same state: CGST and SGST rows, no IGST', () => {
        seed({ outletState: 'Maharashtra', customerState: 'maharashtra' });
        open();
        expect(screen.getByTestId('totals-cgst')).toHaveTextContent('₹ 53.57');
        expect(screen.getByTestId('totals-sgst')).toHaveTextContent('₹ 53.57');
        expect(screen.queryByTestId('totals-igst')).not.toBeInTheDocument();
    });

    it('another state: one IGST row with the whole tax, no CGST / SGST', () => {
        seed({ outletState: 'Maharashtra', customerState: 'Karnataka' });
        open();
        expect(screen.getByTestId('totals-igst')).toHaveTextContent('₹ 107.14');
        expect(screen.queryByTestId('totals-cgst')).not.toBeInTheDocument();
        expect(screen.queryByTestId('totals-sgst')).not.toBeInTheDocument();
    });

    it('wholesale has no round-off line', () => {
        seed({ saleType: 'WHOLESALE' });
        open();
        expect(screen.queryByTestId('totals-round-off')).not.toBeInTheDocument();
    });
});

describe('TotalsSheet: bill discount % and Rs are linked', () => {
    it('typing a % sets the bill discount and the Rs box follows', () => {
        seed();
        open();
        fireEvent.focus(pct());
        fireEvent.change(pct(), { target: { value: '10' } });
        fireEvent.blur(pct());
        expect(draft().extraDiscountPct).toBe(10);
        expect(amt().value).toBe('100.00');
        expect(screen.getByTestId('totals-bill-discount')).toHaveTextContent('- ₹ 100.00');
        expect(screen.getByTestId('totals-net-payable')).toHaveTextContent('₹ 900.00');
    });

    it('typing Rs is converted to % against the bill before the discount, at 6 decimals', () => {
        seed();
        open();
        fireEvent.focus(amt());
        fireEvent.change(amt(), { target: { value: '250' } });
        fireEvent.blur(amt());
        expect(draft().extraDiscountPct).toBe(25);
        expect(pct().value).toBe('25');
        expect(screen.getByTestId('totals-net-payable')).toHaveTextContent('₹ 750.00');

        // an amount that is not a round % keeps six decimals so Rs -> % -> Rs is exact
        fireEvent.focus(amt());
        fireEvent.change(amt(), { target: { value: '333' } });
        fireEvent.blur(amt());
        expect(draft().extraDiscountPct).toBe(33.3);
        fireEvent.focus(amt());
        fireEvent.change(amt(), { target: { value: '1' } });
        fireEvent.blur(amt());
        expect(draft().extraDiscountPct).toBe(0.1);
    });

    it('the % is clamped to 0..100', () => {
        seed();
        open();
        fireEvent.focus(pct());
        fireEvent.change(pct(), { target: { value: '150' } });
        expect(draft().extraDiscountPct).toBe(100);
        fireEvent.change(pct(), { target: { value: '-5' } });
        expect(draft().extraDiscountPct).toBe(0);
    });
});

describe('TotalsSheet: margin block', () => {
    it('is not there for a cashier (not even the eye toggle)', () => {
        seed({ role: 'cashier' });
        open();
        expect(screen.queryByTestId('totals-margin-block')).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/profit/i)).not.toBeInTheDocument();
        expect(screen.queryByTestId('totals-profit')).not.toBeInTheDocument();
    });

    it('admin sees landing cost and profit, and the eye hides and shows them', () => {
        seed({ role: 'admin', showMarginInfo: true });
        open();
        expect(screen.getByTestId('totals-landing')).toHaveTextContent('₹ 600.00');
        expect(screen.getByTestId('totals-profit')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide profit' }));
        expect(screen.queryByTestId('totals-profit')).not.toBeInTheDocument();
        expect(screen.queryByTestId('totals-landing')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show profit' }));
        expect(screen.getByTestId('totals-profit')).toBeInTheDocument();
    });
});
