import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignSupplierDialog } from '../AssignSupplierDialog';
import { assignBatchSupplier } from '@/lib/expiryApi';
import { row } from '../testing/fixtures';

jest.mock('@/lib/expiryApi', () => ({ assignBatchSupplier: jest.fn() }));
const assign = assignBatchSupplier as jest.Mock;
const DIST = [{ id: 'd2', name: 'Beta Pharma' }, { id: 'd1', name: 'Alpha Agencies' }];
const OPENING = (id: string, over = {}) => row(id, { purchaseInvoiceId: null, purchaseInvoiceNo: '', distributorId: null, distributorName: '', ...over });

function setup(rows = [OPENING('a'), OPENING('b')]) {
    const p = { rows, outletId: 'o1', distributors: DIST, onClose: jest.fn(), onDone: jest.fn() };
    render(<AssignSupplierDialog {...p} />);
    return p;
}

describe('AssignSupplierDialog', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lists distributors A to Z and cannot be sent until one is chosen', async () => {
        setup();
        const options = screen.getAllByRole('option').map((o) => o.textContent);
        expect(options).toEqual(['Choose a distributor…', 'Alpha Agencies', 'Beta Pharma']);
        expect(screen.getByRole('button', { name: 'Assign to 2 batches' })).toBeDisabled();
    });

    it('assigns only the batches with no purchase invoice, and says the others are left alone', async () => {
        assign.mockResolvedValue({ updated: 2, skipped: [], distributor: 'Alpha Agencies' });
        const p = setup([OPENING('a'), OPENING('b'), row('c', { productName: 'Boughtol' })]);
        expect(screen.getByText(/1 batch has a purchase invoice/)).toHaveTextContent('Boughtol');
        await userEvent.selectOptions(screen.getByLabelText('Distributor'), 'd1');
        await userEvent.click(screen.getByRole('button', { name: 'Assign to 2 batches' }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith('o1', ['a', 'b'], 'd1'));
        expect(p.onDone).toHaveBeenCalled();
    });

    it('when nothing can be assigned it says so and offers nothing to click', () => {
        setup([row('c')]);
        expect(screen.getByText('None of the selected batches can be assigned.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Assign to/ })).toBeDisabled();
    });

    it('can clear a supplier that was assigned earlier', async () => {
        assign.mockResolvedValue({ updated: 1, skipped: [], distributor: null });
        setup([OPENING('a', { distributorId: 'd1', distributorName: 'Alpha Agencies', supplierAssigned: true })]);
        await userEvent.click(screen.getByRole('button', { name: 'Clear it instead' }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith('o1', ['a'], null));
    });

    it('shows the server\'s reason and keeps the dialog open when it fails', async () => {
        assign.mockRejectedValue({ error: { message: 'That distributor is not in this outlet' } });
        const p = setup();
        await userEvent.selectOptions(screen.getByLabelText('Distributor'), 'd2');
        await userEvent.click(screen.getByRole('button', { name: 'Assign to 2 batches' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('not in this outlet');
        expect(p.onDone).not.toHaveBeenCalled();
    });
});
