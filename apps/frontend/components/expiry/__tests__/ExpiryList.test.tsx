import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExpiryList } from '../ExpiryList';
import { EMPTY_SELECTION } from '@/lib/expiryManager';
import { row } from '../testing/fixtures';

const ROWS = [
    row('a'),
    row('b', { daysToExpiry: -3, expiryDate: '2026-11-14' }),
    row('c', { distributorId: null, distributorName: '', purchaseInvoiceId: null, purchaseInvoiceNo: '' }),
];
const GROUPS = [{ distributorId: 'd1', name: 'Alpha Agencies', batches: 2, mrpValue: 1060, costValue: 636 }, { distributorId: null, name: 'No purchase record', batches: 1, mrpValue: 530, costValue: 318 }];

function setup(over: any = {}) {
    const props = { rows: ROWS, groups: GROUPS, grouped: false, selection: EMPTY_SELECTION, showCost: true, onToggle: jest.fn(), onTogglePage: jest.fn(), ...over };
    render(<ExpiryList {...props} />);
    return props;
}
// the table (md+) and the phone cards both render; jsdom has no CSS, so scope to the table
const table = () => screen.getByRole('table');

describe('ExpiryList', () => {
    it('says expired in words, and not only in colour', () => {
        setup();
        expect(within(table()).getByText('Expired 3 days ago')).toBeInTheDocument();
        expect(within(table()).getAllByText('40 days left').length).toBeGreaterThan(0);
    });

    it('shows the distributor, or says there is no purchase record', () => {
        setup();
        expect(within(table()).getAllByText('Alpha Agencies')).toHaveLength(2);
        expect(within(table()).getByText('No purchase record')).toBeInTheDocument();
    });

    it('ticks one row and a whole page', () => {
        const p = setup();
        fireEvent.click(within(table()).getByLabelText('Select Medicine A, batch B-A'));
        expect(p.onToggle).toHaveBeenCalledWith('a');
        fireEvent.click(within(table()).getByLabelText('Select every batch on this page'));
        expect(p.onTogglePage).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('marks the page checkbox as partly ticked', () => {
        setup({ selection: { ids: ['a'], allMatching: false } });
        const box = within(table()).getByLabelText('Select every batch on this page') as HTMLInputElement;
        expect(box.indeterminate).toBe(true);
        expect(within(table()).getByLabelText('Select Medicine A, batch B-A')).toBeChecked();
    });

    it('shows cost value to people who may see rates, MRP value to the rest', () => {
        setup();
        expect(within(table()).getByRole('columnheader', { name: 'Cost value' })).toBeInTheDocument();
        expect(within(table()).getAllByText('₹318')[0]).toBeInTheDocument();
    });
    it('falls back to MRP value without rates', () => {
        setup({ showCost: false, rows: [row('a', { costValue: undefined })] });
        expect(within(table()).getByRole('columnheader', { name: 'MRP value' })).toBeInTheDocument();
        expect(within(table()).getAllByText('₹530')[0]).toBeInTheDocument();
    });

    it('can group by distributor, with the totals of the whole list in each header', () => {
        setup({ grouped: true });
        const head = within(table()).getAllByRole('rowgroup', { hidden: true }).length; // header rows are <th scope=rowgroup>
        expect(head).toBeGreaterThan(0);
        expect(within(table()).getByText(/2 batches · ₹636 in total/)).toBeInTheDocument();
    });

    it('a group checkbox ticks only that distributor on this page', () => {
        const p = setup({ grouped: true });
        fireEvent.click(within(table()).getByLabelText("Select this page's batches from Alpha Agencies"));
        expect(p.onTogglePage).toHaveBeenCalledWith(['a', 'b']);
    });

    it('has a card per batch on a phone', () => {
        setup();
        const cards = screen.getByRole('list', { name: 'Batches' });
        expect(within(cards).getAllByRole('listitem').length).toBe(1 + ROWS.length);   // + the "select all" row
    });
});
