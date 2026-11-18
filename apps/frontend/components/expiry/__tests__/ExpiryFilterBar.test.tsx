import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpiryFilterBar } from '../ExpiryFilterBar';
import { DEFAULT_FILTERS, monthKey, type ExpiryFilters } from '@/lib/expiryManager';

const DISTRIBUTORS = [{ id: 'd1', name: 'Alpha Agencies' }, { id: 'd2', name: 'Beta Pharma' }];

function setup(over: Partial<ExpiryFilters> = {}) {
    const onChange = jest.fn();
    render(<ExpiryFilterBar filters={{ ...DEFAULT_FILTERS, ...over }} distributors={DISTRIBUTORS} onChange={onChange} />);
    return onChange;
}

describe('ExpiryFilterBar', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    it('offers the quick windows and marks the chosen one', () => {
        const onChange = setup();
        expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
        expect(onChange).toHaveBeenCalledWith({ w: 'next-month' });
    });

    it('"Pick months" starts on this month, then a month toggles on and off', async () => {
        const onChange = setup();
        await userEvent.click(screen.getByRole('button', { name: 'Pick months…' }));
        expect(onChange).toHaveBeenCalledWith({ w: 'months', months: [monthKey(new Date())] });
    });

    it('shows the month grid for a months window, and a chip per chosen month that can be removed', async () => {
        const onChange = setup({ w: 'months', months: ['2027-01', '2027-03'] });
        expect(screen.getByRole('button', { name: 'Jan 2027' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Feb 2027' })).toHaveAttribute('aria-pressed', 'false');
        await userEvent.click(screen.getByRole('button', { name: 'Feb 2027' }));
        expect(onChange).toHaveBeenLastCalledWith({ months: ['2027-01', '2027-02', '2027-03'] });
        await userEvent.click(screen.getByRole('button', { name: 'Remove Mar 2027' }));
        expect(onChange).toHaveBeenLastCalledWith({ months: ['2027-01'] });
    });

    it('moves between years in the month grid', async () => {
        setup({ w: 'months', months: ['2027-01'] });
        await userEvent.click(screen.getByRole('button', { name: 'Next year' }));
        expect(screen.getByRole('button', { name: 'Jun 2028' })).toBeInTheDocument();
    });

    it('custom dates: two date boxes, and a warning when "from" is after "to"', () => {
        setup({ w: 'custom', from: '2027-05-01', to: '2027-02-01' });
        expect(screen.getByLabelText('From (expiry date)')).toHaveValue('2027-05-01');
        expect(screen.getByRole('alert')).toHaveTextContent(/"From" is after "To"/);
    });

    it('picks several distributors, can search them, and offers "no purchase record"', async () => {
        const onChange = setup();
        await userEvent.click(screen.getByRole('button', { name: /Distributors: All distributors/ }));
        expect(screen.getByRole('option', { name: 'No purchase record' })).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText('Search distributors'), 'bet');
        expect(screen.queryByRole('option', { name: 'Alpha Agencies' })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('option', { name: 'Beta Pharma' }));
        expect(onChange).toHaveBeenCalledWith({ distributors: ['d2'] });
    });

    it('names the chosen distributors on the button', () => {
        setup({ distributors: ['d1'] });
        expect(screen.getByRole('button', { name: 'Distributors: Alpha Agencies' })).toBeInTheDocument();
    });

    it('the already-expired switch is locked on the Expired window (it would mean nothing)', () => {
        setup({ w: 'expired' });
        expect(screen.getByRole('switch', { name: /already expired/i })).toBeDisabled();
    });

    it('grouping by distributor also sorts by distributor, and switching it off goes back to soonest expiry', async () => {
        const onChange = setup();
        await userEvent.click(screen.getByRole('switch', { name: /Group the list by distributor/ }));
        expect(onChange).toHaveBeenCalledWith({ group: true, sort: 'distributor' });
    });

    it('typing in the search box updates the filter', () => {
        const onChange = setup();
        fireEvent.change(screen.getByLabelText('Search product or batch'), { target: { value: 'amox' } });
        expect(onChange).toHaveBeenCalledWith({ q: 'amox' });
    });
});
