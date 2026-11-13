import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PurchaseLineCard } from './PurchaseLineCard';
import { goodLine } from './testEntry';
import { emptyItem } from '@/lib/purchaseEntry';

const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const show = (item = goodLine(), onEdit = jest.fn()) => { render(<ul><PurchaseLineCard item={item} number={1} onEdit={onEdit} /></ul>); return onEdit; };

describe('PurchaseLineCard', () => {
    it('shows the medicine, batch, expiry and the line amount', () => {
        show();
        expect(screen.getByText('DOLO 650')).toBeInTheDocument();
        expect(screen.getByText('B: B1')).toBeInTheDocument();
        expect(screen.getByText('Exp: 12/2099')).toBeInTheDocument();
        expect(screen.getByTestId('line-amount')).toHaveTextContent('₹236.25');         // 10 x 22.5 = 225 + 5% GST
    });

    it('folds the desktop row into labelled values with the desktop column names: QTY, FREE, PKG, MRP, RATE, GST%', () => {
        show();
        const figures = screen.getByTestId('line-figures');
        const names = Array.from(figures.querySelectorAll('span.uppercase')).map((e) => e.textContent);
        expect(names).toEqual(['Qty', 'Free', 'Pkg', 'MRP', 'Rate', 'GST%']);            // the same order as the desktop columns
        expect(screen.getByTestId('card-qty')).toHaveTextContent('10');
        expect(screen.getByTestId('card-free')).toHaveTextContent('2');
        expect(screen.getByTestId('card-pkg')).toHaveTextContent('15');
        expect(screen.getByTestId('card-pkg')).toHaveTextContent('Tablet');
        expect(screen.getByTestId('card-mrp')).toHaveTextContent('₹32.10');
        expect(screen.getByTestId('card-rate')).toHaveTextContent('₹22.50');
        expect(screen.getByTestId('card-gst')).toHaveTextContent('5');
        expect(screen.getByTestId('card-units')).toHaveTextContent('= 150 units + 30 free');
    });

    it('PTR, PTS and Disc% appear once they have a value, after GST% like the desktop', () => {
        show(goodLine({ discountPct: 10, ptr: 25, pts: 24 }));
        const names = Array.from(screen.getByTestId('line-figures').querySelectorAll('span.uppercase')).map((e) => e.textContent);
        expect(names).toEqual(['Qty', 'Free', 'Pkg', 'MRP', 'Rate', 'GST%', 'Disc%', 'PTR', 'PTS']);
    });

    it('is one big button that opens the editor; there are no fields on the card', () => {
        const onEdit = show();
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1: DOLO 650/ }));
        expect(onEdit).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    });

    it('a complete line has no problems listed', () => {
        show();
        expect(screen.queryByTestId('line-issues')).not.toBeInTheDocument();
    });

    it('an unfinished line lists what is missing, in plain words', () => {
        show(goodLine({ batchNo: '', qty: 0 }));
        expect(screen.getByTestId('line-issues')).toHaveTextContent('Batch number needed');
        expect(screen.getByTestId('line-issues')).toHaveTextContent('Quantity needed');
    });

    it('an expired batch is marked red with the word Expired; expiring soon is amber with its own words', () => {
        const { unmount } = render(<ul><PurchaseLineCard item={goodLine({ expiryDate: iso(-10) })} number={1} onEdit={jest.fn()} /></ul>);
        expect(screen.getByTestId('expiry-bar')).toHaveAttribute('data-status', 'expired');
        expect(screen.getByText('Expired')).toBeInTheDocument();
        unmount();
        render(<ul><PurchaseLineCard item={goodLine({ expiryDate: iso(20) })} number={1} onEdit={jest.fn()} /></ul>);
        expect(screen.getByTestId('expiry-bar')).toHaveAttribute('data-status', 'near');
        expect(screen.getByText('Expires within 90 days')).toBeInTheDocument();
    });

    it('a scanned line matched with low confidence asks to confirm the medicine', () => {
        show(goodLine({ ocrOriginalName: 'DOLLO 65', ocrMatchConfidence: 0.5 }));
        expect(screen.getByText(/Bill says “DOLLO 65”/)).toBeInTheDocument();
    });

    it('a line with no medicine chosen says so', () => {
        show({ ...emptyItem(), productName: 'Dol' });
        expect(screen.getByText('Dol')).toBeInTheDocument();
        expect(screen.getByTestId('line-issues')).toHaveTextContent('Pick the medicine from the list');
    });
});
