import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BillsSheet } from './BillsSheet';
import { useBillingStore } from '@/store/billingStore';

const line = (price: number) => ({
    batchId: `b-${price}`, productId: 'p1', productName: 'DOLO 650', rate: price, saleRate: price, mrp: price, totalQty: 1,
    qtyStrips: 1, qtyLoose: 0, packSize: 1, gstRate: 0, totalAmount: price, sellAmount: price,
}) as any;

/** n bills; the first has two items (Rs 150), the second a named customer. Returns their ids oldest first. */
function seed(n: number, opts: { activeIndex?: number } = {}) {
    useBillingStore.setState({ drafts: {}, activeDraftId: null });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
        const id = useBillingStore.getState().createDraft();
        ids.push(id);
        // createdAt decides the order, so give each bill its own second
        useBillingStore.getState().updateDraftHeader(id, { createdAt: new Date(2026, 0, 1, 10, 0, i).toISOString() });
    }
    useBillingStore.setState((s) => ({
        activeDraftId: ids[opts.activeIndex ?? 0],
        drafts: {
            ...s.drafts,
            [ids[0]]: { ...s.drafts[ids[0]], cart: [line(100), line(50)], saveStatus: 'saved' },
            ...(n > 1 ? { [ids[1]]: { ...s.drafts[ids[1]], customerLedger: { id: 'l1', name: 'Rahul Sharma (9876543210)' } as any, saveStatus: 'saving' } } : {}),
        },
    }));
    return ids;
}

describe('BillsSheet', () => {
    it('lists each bill with its customer (or Walk-in), amount and save status, and marks the current one', () => {
        seed(2);
        render(<BillsSheet open onClose={jest.fn()} />);
        const rows = screen.getAllByTestId('bill-row');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Bill 1')).toBeInTheDocument();
        expect(within(rows[0]).getByText(/Walk-in · 2 items/)).toBeInTheDocument();
        expect(within(rows[0]).getByText('₹150')).toBeInTheDocument();
        expect(within(rows[0]).getByText('Saved')).toBeInTheDocument();
        expect(within(rows[0]).getByText('Current')).toBeInTheDocument();
        expect(within(rows[1]).getByText(/Rahul Sharma · 0 items/)).toBeInTheDocument();   // the "(mobile)" suffix is dropped
        expect(within(rows[1]).getByText('Saving')).toBeInTheDocument();
    });

    it('tapping a bill switches to it and closes the sheet', () => {
        const ids = seed(2);
        const onClose = jest.fn();
        render(<BillsSheet open onClose={onClose} />);
        fireEvent.click(within(screen.getAllByTestId('bill-row')[1]).getByText('Bill 2'));
        expect(useBillingStore.getState().activeDraftId).toBe(ids[1]);
        expect(onClose).toHaveBeenCalled();
    });

    it('New bill opens an empty bill and makes it current', () => {
        const ids = seed(1);
        const onClose = jest.fn();
        render(<BillsSheet open onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /New bill/ }));
        const state = useBillingStore.getState();
        expect(Object.keys(state.drafts)).toHaveLength(2);
        expect(state.activeDraftId).not.toBe(ids[0]);
        expect(state.drafts[state.activeDraftId!].cart).toHaveLength(0);
        expect(onClose).toHaveBeenCalled();
    });

    it('at 10 bills New bill is disabled and a message says why; no 11th bill is made', () => {
        seed(10);
        render(<BillsSheet open onClose={jest.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent('already have 10 bills open');
        const btn = screen.getByRole('button', { name: /New bill/ });
        expect(btn).toBeDisabled();
        fireEvent.click(btn);
        expect(Object.keys(useBillingStore.getState().drafts)).toHaveLength(10);
        expect(screen.getByText('10 of 10 bills open')).toBeInTheDocument();
    });

    it('closing an empty bill removes it at once', () => {
        const ids = seed(2);
        render(<BillsSheet open onClose={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close Bill 2' }));
        expect(useBillingStore.getState().drafts[ids[1]]).toBeUndefined();
        expect(useBillingStore.getState().drafts[ids[0]]).toBeDefined();
    });

    it('closing a bill that has items asks first; Keep bill leaves it, Close bill removes it', () => {
        const ids = seed(2);
        render(<BillsSheet open onClose={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close Bill 1' }));
        expect(screen.getByText('Close this bill?')).toBeInTheDocument();
        expect(useBillingStore.getState().drafts[ids[0]]).toBeDefined();           // nothing removed yet

        fireEvent.click(screen.getByRole('button', { name: 'Keep bill' }));
        expect(useBillingStore.getState().drafts[ids[0]]).toBeDefined();
        expect(screen.getByText('Open bills')).toBeInTheDocument();                // back on the list

        fireEvent.click(screen.getByRole('button', { name: 'Close Bill 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close bill' }));
        expect(useBillingStore.getState().drafts[ids[0]]).toBeUndefined();
    });

    it('a single bill has no close button (use the menu to start over)', () => {
        seed(1);
        render(<BillsSheet open onClose={jest.fn()} />);
        expect(screen.queryByRole('button', { name: /^Close Bill/ })).not.toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
        seed(2);
        render(<BillsSheet open={false} onClose={jest.fn()} />);
        expect(screen.queryByText('Open bills')).not.toBeInTheDocument();
    });
});
