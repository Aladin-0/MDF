import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchResultRow } from './SearchResultRow';

const batch = (id: string, extra: any = {}) => ({
    id, batchNo: `B-${id}`, expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip', ...extra,
});
const product = (extra: any = {}): any => ({
    id: 'p1', name: 'LOSAR 50MG TAB', composition: 'LOSARTAN POTASSIUM', manufacturer: 'Mfg', gstRate: 12, packSize: 10, packUnit: 'tablet', packType: 'strip',
    scheduleType: 'OTC', mrp: 178.31, totalStock: 24, nearestExpiry: '2027-08-31', isLowStock: false, hasStock: true, batches: [batch('b1')], ...extra,
});

const renderRow = (p: any, props: any = {}) => {
    const handlers = { onAdd: jest.fn(), onSubstitutes: jest.fn(), ...props };
    render(<ul><SearchResultRow product={p} {...handlers} /></ul>);
    return handlers;
};

describe('SearchResultRow', () => {
    it('shows name, composition, pack, price, stock chip and the nearest expiry as MM/YY', () => {
        renderRow(product());
        expect(screen.getByText('LOSAR 50MG TAB')).toBeInTheDocument();
        expect(screen.getByText(/LOSARTAN POTASSIUM · 10 tablet/)).toBeInTheDocument();
        expect(screen.getByTestId('result-price')).toHaveTextContent('₹178.31');
        expect(screen.getByTestId('stock-chip')).toHaveTextContent('24 strips in stock');
        expect(screen.getByTestId('stock-chip')).toHaveClass('text-emerald-900');
        expect(screen.getByText('exp 08/27')).toBeInTheDocument();
    });

    it('price search: shows the matched price, not the catalogue MRP', () => {
        renderRow(product({ matchedMrp: 175 }));
        expect(screen.getByTestId('result-price')).toHaveTextContent('₹175.00');
    });

    it('stock wording follows the desktop row: loose packs show strips + loose, packs that cannot be loose show a plain count', () => {
        const { unmount } = render(<ul><SearchResultRow product={product({ totalStock: 3.4 })} onAdd={jest.fn()} /></ul>);
        expect(screen.getByTestId('stock-chip')).toHaveTextContent('3 strips + 4 loose in stock');
        unmount();
        render(<ul><SearchResultRow product={product({ packType: 'bottle', packSize: 1, totalStock: 7, batches: [batch('b1', { packType: 'bottle', packSize: 1 })] })} onAdd={jest.fn()} /></ul>);
        expect(screen.getByTestId('stock-chip')).toHaveTextContent('7 in stock');
    });

    it('out of stock: red "Out of stock", an inline message and no Add button', () => {
        renderRow(product({ totalStock: 0, hasStock: false, batches: [] }));
        expect(screen.getByTestId('stock-chip')).toHaveTextContent('Out of stock');
        expect(screen.getByTestId('stock-chip')).toHaveClass('text-red-900');
        expect(screen.getByTestId('no-valid-stock')).toHaveTextContent('No stock available for LOSAR 50MG TAB');
        expect(screen.queryByTestId('add-product')).not.toBeInTheDocument();
    });

    it('stock only in expired batches counts as no valid stock', () => {
        renderRow(product({ batches: [batch('b1', { expiryDate: '2020-01-31' })] }));
        expect(screen.getByTestId('no-valid-stock')).toHaveTextContent('No valid stock');
        expect(screen.queryByTestId('add-product')).not.toBeInTheDocument();
    });

    it('Add to Shortbook only appears when the parent allows it, and swaps to a confirmation once done', () => {
        const noStock = product({ totalStock: 0, batches: [] });
        const { unmount } = render(<ul><SearchResultRow product={noStock} onAdd={jest.fn()} /></ul>);
        expect(screen.queryByTestId('add-to-shortbook')).not.toBeInTheDocument();
        unmount();

        const onShortbook = jest.fn();
        const { unmount: u2 } = render(<ul><SearchResultRow product={noStock} onAdd={jest.fn()} onShortbook={onShortbook} /></ul>);
        fireEvent.click(screen.getByTestId('add-to-shortbook'));
        expect(onShortbook).toHaveBeenCalledWith(noStock);
        u2();

        render(<ul><SearchResultRow product={noStock} onAdd={jest.fn()} onShortbook={onShortbook} shortbookDone /></ul>);
        expect(screen.queryByTestId('add-to-shortbook')).not.toBeInTheDocument();
        expect(screen.getByText('On the Shortbook')).toBeInTheDocument();
    });

    it('substitute badges: same strength (green), different strength and different form (amber)', () => {
        const { unmount } = render(<ul><SearchResultRow product={product({ substitute: { sameStrength: true, sameForm: true } })} onAdd={jest.fn()} /></ul>);
        expect(screen.getByText('Same strength')).toBeInTheDocument();
        expect(screen.queryByText('Different form')).not.toBeInTheDocument();
        unmount();
        render(<ul><SearchResultRow product={product({ substitute: { sameStrength: false, sameForm: false } })} onAdd={jest.fn()} /></ul>);
        expect(screen.getByText('Different strength')).toBeInTheDocument();
        expect(screen.getByText('Different form')).toBeInTheDocument();
    });

    it('Add and Substitutes buttons call back', () => {
        const p = product();
        const h = renderRow(p);
        fireEvent.click(screen.getByTestId('add-product'));
        fireEvent.click(screen.getByTestId('show-substitutes'));
        expect(h.onAdd).toHaveBeenCalledTimes(1);
        expect(h.onAdd).toHaveBeenCalledWith(p);
        expect(h.onSubstitutes).toHaveBeenCalledWith(p);
    });

    it('there is ONE way to add: tapping the medicine name does nothing, only the Add button opens the Add sheet', () => {
        const h = renderRow(product());
        fireEvent.click(screen.getByText('LOSAR 50MG TAB'));
        expect(h.onAdd).not.toHaveBeenCalled();
        expect(screen.getAllByRole('button').filter((b) => /add/i.test(b.textContent || ''))).toHaveLength(1);
    });

    it('a medicine already in the bill shows an "In bill" tag and the button says Add more', () => {
        renderRow(product(), { inBill: '2 strips' });
        expect(screen.getByTestId('in-bill-badge')).toHaveTextContent('In bill · 2 strips');
        expect(screen.getByTestId('add-product')).toHaveTextContent('Add more');
    });

    it('a medicine that is not in the bill says plain Add and has no tag', () => {
        renderRow(product());
        expect(screen.queryByTestId('in-bill-badge')).not.toBeInTheDocument();
        expect(screen.getByTestId('add-product')).toHaveTextContent(/^Add$/);
    });

    it('no Substitutes button while the substitutes list is showing (no handler given)', () => {
        render(<ul><SearchResultRow product={product()} onAdd={jest.fn()} /></ul>);
        expect(screen.queryByTestId('show-substitutes')).not.toBeInTheDocument();
    });
});
