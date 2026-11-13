import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MobileTopBar } from './MobileTopBar';
import { useBillingStore } from '@/store/billingStore';

jest.mock('@/components/shared/Sidebar', () => ({ Sidebar: () => <nav aria-label="App navigation">nav drawer</nav> }));

const line = (price: number) => ({
    batchId: `b-${price}`, productId: 'p1', productName: 'DOLO 650', rate: price, saleRate: price, mrp: price, ptr: price - 10, pts: price - 20, totalQty: 1,
    qtyStrips: 1, qtyLoose: 0, packSize: 1, gstRate: 0, totalAmount: price, sellAmount: price,
}) as any;

function seed(updates: Record<string, unknown> = {}, cart: any[] = [], staffRole = 'admin') {
    useBillingStore.setState({
        drafts: {}, activeDraftId: null, isPinVerified: true, showMarginInfo: true,
        activeStaff: { id: 's1', name: 'Asha', role: staffRole } as any,
    });
    const id = useBillingStore.getState().createDraft();
    useBillingStore.setState((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], ...updates, cart } as any } }));
    return id;
}
const active = () => { const s = useBillingStore.getState(); return s.drafts[s.activeDraftId!]; };
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Bill options' }));

describe('MobileTopBar', () => {
    it('shows the bill switcher chip as "Bill N · total" and the sale type', () => {
        seed({}, [line(100), line(50)]);
        render(<MobileTopBar />);
        expect(screen.getByRole('button', { name: /Open bills/ })).toHaveTextContent('Bill 1 · ₹150');
        expect(screen.getByRole('button', { name: /Sale type Retail/ })).toHaveTextContent('Retail');
    });

    it('the hamburger opens the same navigation drawer as the rest of the app', () => {
        seed();
        render(<MobileTopBar />);
        expect(screen.queryByText('nav drawer')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
        expect(screen.getByText('nav drawer')).toBeInTheDocument();
    });

    it('the bill chip opens the Bills sheet', () => {
        seed();
        render(<MobileTopBar />);
        fireEvent.click(screen.getByRole('button', { name: /Open bills/ }));
        expect(screen.getByText('Open bills', { selector: 'h2' })).toBeInTheDocument();
    });

    describe('sale type', () => {
        it('switching asks first and changes nothing until confirmed', () => {
            const id = seed({ patient: { id: 'm1', name: 'Priya' } }, [line(100)]);
            render(<MobileTopBar />);
            fireEvent.click(screen.getByRole('button', { name: /Sale type Retail/ }));
            expect(screen.getByText('Switch to Wholesale?')).toBeInTheDocument();
            expect(screen.getByText(/PTR \/ PTS rates/)).toBeInTheDocument();
            expect(screen.getByText(/credit sales/)).toBeInTheDocument();
            expect(screen.getByText(/is cleared/)).toBeInTheDocument();
            expect(useBillingStore.getState().drafts[id].saleType).toBe('RETAIL');

            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(useBillingStore.getState().drafts[id].saleType).toBe('RETAIL');
        });

        it('confirming calls setSaleType: wholesale, PTR basis, patient cleared, cart re-priced', () => {
            const id = seed({ patient: { id: 'm1', name: 'Priya' } }, [line(100)]);
            render(<MobileTopBar />);
            fireEvent.click(screen.getByRole('button', { name: /Sale type Retail/ }));
            fireEvent.click(screen.getByRole('button', { name: 'Switch to Wholesale' }));
            const d = useBillingStore.getState().drafts[id];
            expect(d.saleType).toBe('WHOLESALE');
            expect(d.billingBasis).toBe('PTR');
            expect(d.patient).toBeNull();
            expect(d.cart[0].rate).toBe(80);                          // PTS
            expect(screen.getByRole('button', { name: /Sale type Wholesale/ })).toHaveTextContent('Wholesale');
        });

        it('wholesale back to retail explains the MRP re-pricing', () => {
            seed({ saleType: 'WHOLESALE' }, [line(100)]);
            render(<MobileTopBar />);
            fireEvent.click(screen.getByRole('button', { name: /Sale type Wholesale/ }));
            expect(screen.getByText('Switch to Retail?')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Switch to Retail' }));
            expect(active().saleType).toBe('RETAIL');
        });

        it('is disabled (and says why) for a bill that came from a quotation', () => {
            seed({ quotationId: 'q1', sourceQuotationNo: 'QT-1' });
            render(<MobileTopBar />);
            const chip = screen.getByRole('button', { name: /locked because this bill came from a quotation/ });
            expect(chip).toBeDisabled();
        });
    });

    describe('menu', () => {
        it('rows are at least 48px tall (min-h-12)', () => {
            seed();
            render(<MobileTopBar />);
            openMenu();
            for (const item of screen.getAllByRole('menuitem')) expect(item).toHaveClass('min-h-14');
        });

        it('Invoice / Quotation toggle switches the document mode', () => {
            seed();
            render(<MobileTopBar />);
            openMenu();
            fireEvent.click(screen.getByRole('menuitem', { name: /Switch to Quotation/ }));
            expect(active().documentMode).toBe('quotation');
            openMenu();
            fireEvent.click(screen.getByRole('menuitem', { name: /Switch to Invoice/ }));
            expect(active().documentMode).toBe('invoice');
        });

        it('the document toggle is disabled for a bill with a quotationId', () => {
            seed({ quotationId: 'q1' });
            render(<MobileTopBar />);
            openMenu();
            expect(screen.getByRole('menuitem', { name: /Switch to Quotation/ })).toBeDisabled();
        });

        it('Margin view toggle is there for admin/manager and flips showMarginInfo', () => {
            seed({}, [], 'manager');
            render(<MobileTopBar />);
            openMenu();
            const row = screen.getByRole('menuitemcheckbox', { name: /Margin view/ });
            expect(row).toHaveAttribute('aria-checked', 'true');
            fireEvent.click(row);
            expect(useBillingStore.getState().showMarginInfo).toBe(false);
            expect(screen.getByRole('menuitemcheckbox', { name: /Margin view/ })).toHaveTextContent('Off');
        });

        it('Margin view is hidden from billing staff', () => {
            seed({}, [], 'billing_staff');
            render(<MobileTopBar />);
            openMenu();
            expect(screen.queryByRole('menuitemcheckbox', { name: /Margin view/ })).not.toBeInTheDocument();
        });

        it('Counter bill clears customer, person and name (retail)', () => {
            seed({ customer: { id: 'c1', name: 'Rahul' }, customerLedger: { id: 'l1', name: 'Rahul' }, patient: { id: 'm1', name: 'Priya' }, walkInName: 'Ramesh' });
            render(<MobileTopBar />);
            openMenu();
            fireEvent.click(screen.getByTestId('menu-counter-bill'));
            const d = active();
            expect(d.customer).toBeNull();
            expect(d.customerLedger).toBeNull();
            expect(d.patient).toBeNull();
            expect(d.walkInName).toBeNull();
        });

        it('there is no Non-valued customer option: a bill is a Counter bill or a customer bill', () => {
            seed();
            render(<MobileTopBar />);
            openMenu();
            expect(screen.getByTestId('menu-counter-bill')).toBeInTheDocument();
            expect(screen.queryByTestId('menu-non-valued')).not.toBeInTheDocument();
        });

        it('wholesale hides Counter bill (family rules: retail only)', () => {
            seed({ saleType: 'WHOLESALE' });
            render(<MobileTopBar />);
            openMenu();
            expect(screen.queryByTestId('menu-counter-bill')).not.toBeInTheDocument();
            expect(screen.queryByTestId('menu-non-valued')).not.toBeInTheDocument();
        });

        it('Lock terminal sends the cashier back to the PIN screen', () => {
            seed();
            render(<MobileTopBar />);
            openMenu();
            expect(screen.getByText(/Signed in as Asha/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('menuitem', { name: /Lock terminal/ }));
            expect(useBillingStore.getState().isPinVerified).toBe(false);
        });

        it('Close this bill: an empty bill closes at once; the last bill is replaced by a fresh one', () => {
            const id = seed();
            render(<MobileTopBar />);
            openMenu();
            fireEvent.click(screen.getByRole('menuitem', { name: /Close this bill/ }));
            const s = useBillingStore.getState();
            expect(s.drafts[id]).toBeUndefined();
            expect(Object.keys(s.drafts)).toHaveLength(1);             // a new empty bill took its place
            expect(s.activeDraftId).not.toBe(id);
        });

        it('Close this bill with items asks first', () => {
            const id = seed({}, [line(100)]);
            render(<MobileTopBar />);
            openMenu();
            fireEvent.click(screen.getByRole('menuitem', { name: /Close this bill/ }));
            expect(screen.getByText('Close this bill?')).toBeInTheDocument();
            expect(useBillingStore.getState().drafts[id]).toBeDefined();

            fireEvent.click(screen.getByRole('button', { name: 'Keep bill' }));
            expect(useBillingStore.getState().drafts[id]).toBeDefined();

            openMenu();
            fireEvent.click(screen.getByRole('menuitem', { name: /Close this bill/ }));
            fireEvent.click(screen.getByRole('button', { name: 'Close bill' }));
            expect(useBillingStore.getState().drafts[id]).toBeUndefined();
        });
    });
});
