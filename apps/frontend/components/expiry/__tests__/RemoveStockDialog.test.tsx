import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemoveStockDialog } from '../RemoveStockDialog';
import { removeExpiryStock } from '@/lib/expiryApi';
import { row } from '../testing/fixtures';

jest.mock('@/lib/expiryApi', () => ({ removeExpiryStock: jest.fn() }));
const remove = removeExpiryStock as jest.Mock;

const ROWS = [row('a', { daysToExpiry: -2 }), row('b', { daysToExpiry: -9, qtyStrips: 2, qtyLoose: 0, costValue: 120 })];

function setup(rows = ROWS) {
    const p = { rows, outletId: 'o1', onClose: jest.fn(), onDone: jest.fn() };
    render(<RemoveStockDialog {...p} />);
    return p;
}
const pin = () => screen.getByLabelText(/Your password/);
const submit = () => screen.getByRole('button', { name: /^Remove \d+ batch/ });

describe('RemoveStockDialog', () => {
    beforeEach(() => jest.clearAllMocks());

    it('starts on "Expired" when everything has expired, lists every batch and the cost written off', () => {
        setup();
        expect(screen.getByRole('radio', { name: 'Expired' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText('Medicine A')).toBeInTheDocument();
        expect(screen.getByText('Medicine B')).toBeInTheDocument();
        expect(screen.getByText('₹438')).toBeInTheDocument();          // 318 + 120
    });

    it('warns about batches that have not expired yet', () => {
        setup([row('a', { daysToExpiry: 12 }), row('b', { daysToExpiry: -1 })]);
        expect(screen.getByRole('status')).toHaveTextContent('1 of these has not expired yet');
        expect(screen.getByRole('radio', { name: 'Damaged' })).toHaveAttribute('aria-checked', 'true');   // not "Expired" for live stock
    });

    it('cannot be sent without the password', async () => {
        setup();
        expect(submit()).toBeDisabled();
        await userEvent.type(pin(), 'MyPass#1');
        expect(submit()).toBeEnabled();
    });

    it('sends every batch whole, with the reason, note and PIN, then reports back', async () => {
        remove.mockResolvedValue({ success: true, batches: 2, removed: [] });
        const p = setup();
        await userEvent.click(screen.getByRole('radio', { name: 'Destroyed' }));
        await userEvent.type(screen.getByLabelText('Note (optional)'), ' thrown away ');
        await userEvent.type(pin(), 'MyPass#1');
        await userEvent.click(submit());
        await waitFor(() => expect(remove).toHaveBeenCalledWith('o1', { type: 'DESTROYED', reason: 'thrown away', password: 'MyPass#1', items: [{ batchId: 'a' }, { batchId: 'b' }] }));
        expect(p.onDone).toHaveBeenCalled();
    });

    it('lets one batch be partly removed, and blocks a quantity that is not in stock', async () => {
        setup();
        await userEvent.click(screen.getAllByRole('button', { name: 'Change quantity' })[0]);
        const strips = screen.getByLabelText('Strips to remove from batch B-A');
        await userEvent.clear(strips);
        await userEvent.type(strips, '9');
        expect(screen.getByRole('alert')).toHaveTextContent(/Only 5 strips/);
        await userEvent.type(pin(), 'MyPass#1');
        expect(submit()).toBeDisabled();
        await userEvent.clear(strips);
        await userEvent.type(strips, '2');
        expect(submit()).toBeEnabled();
    });

    it('a wrong password says "Wrong password" next to the box, clears it and keeps the dialog open', async () => {
        remove.mockRejectedValue({ error: { code: 'WRONG_PASSWORD', message: 'Wrong password' } });
        const p = setup();
        await userEvent.type(pin(), 'wrong');
        await userEvent.click(submit());
        expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password');
        expect(pin()).toHaveValue('');
        expect(p.onDone).not.toHaveBeenCalled();
    });

    it('when the server refuses one batch, that row says why and nothing is reported as done', async () => {
        remove.mockRejectedValue({ error: { code: 'INSUFFICIENT', message: 'Medicine B B-B: only 20 unit(s) in stock', batchId: 'b' } });
        const p = setup();
        await userEvent.type(pin(), 'MyPass#1');
        await userEvent.click(submit());
        expect(await screen.findByText(/only 20 unit\(s\) in stock/)).toBeInTheDocument();
        expect(p.onDone).not.toHaveBeenCalled();
        expect(submit()).toBeEnabled();                                   // fix and try again
    });

    it('cannot be closed while it is saving', async () => {
        let finish: (v: any) => void = () => {};
        remove.mockReturnValue(new Promise((r) => { finish = r; }));
        const p = setup();
        await userEvent.type(pin(), 'MyPass#1');
        await userEvent.click(submit());
        await userEvent.keyboard('{Escape}');
        expect(p.onClose).not.toHaveBeenCalled();
        finish({ success: true, batches: 2, removed: [] });
    });
});
