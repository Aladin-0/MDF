import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchGrid } from '../product/BatchGrid';

const batch = (id: string, over: any = {}) => ({
    id, batchNo: id.toUpperCase(), expiryDate: '2029-06-01', mfgDate: null, qtyStrips: 50, qtyLoose: 0, packSize: 10, packType: 'strip', packUnit: 'tablet',
    mrp: 100, purchaseRate: 50, landingRate: 50, rackLocation: '', ...over,
});
const BATCHES = [batch('b1'), batch('b2', { mrp: 120 }), batch('b3', { qtyStrips: 0 })];
const PRODUCT = { name: 'pj juice', packSize: 10, packType: 'strip', packUnit: 'tablet' };

const cell = (batchNo: string, label: string) => screen.getByLabelText(`${label} of batch ${batchNo}`) as HTMLInputElement;

function setup(over: any = {}) {
    const props = {
        product: PRODUCT, batches: BATCHES, showRates: true,
        onSaveBatch: jest.fn().mockResolvedValue({ changed: [], warnings: [] }),
        onSaved: jest.fn().mockResolvedValue(undefined),
        onExit: jest.fn(),
        ...over,
    };
    render(<BatchGrid {...props} />);
    return props;
}
const type = async (el: HTMLElement, value: string) => { await userEvent.clear(el); await userEvent.type(el, value); };
const saveButton = () => screen.getByRole('button', { name: /^Save/ });

describe('BatchGrid', () => {
    it('shows every batch as a row of editable cells, pack size included, so none has to be opened one by one', () => {
        setup();
        for (const no of ['B1', 'B2', 'B3']) {
            for (const label of ['Batch no', 'Expiry', 'Pack size', 'MRP', 'Purchase rate', 'Landing rate', 'Rack']) expect(cell(no, label)).toBeEnabled();
        }
        expect(cell('B2', 'MRP').value).toBe('120');
        expect(cell('B1', 'Pack size').value).toBe('10');
    });

    it('hides the cost columns from people who may not see purchase rates', () => {
        setup({ showRates: false });
        expect(screen.queryByLabelText('Purchase rate of batch B1')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Landing rate of batch B1')).not.toBeInTheDocument();
        expect(cell('B1', 'MRP')).toBeInTheDocument();
    });

    it('starts in the first MRP cell, and says nothing is changed yet', () => {
        setup();
        expect(cell('B1', 'MRP')).toHaveFocus();
        expect(screen.getByText(/No changes yet/)).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    it('Enter and the arrow keys move down a column, Shift+Enter and ArrowUp move up (like a spreadsheet)', async () => {
        setup();
        cell('B1', 'MRP').focus();
        await userEvent.keyboard('{Enter}');
        expect(cell('B2', 'MRP')).toHaveFocus();
        await userEvent.keyboard('{ArrowDown}');
        expect(cell('B3', 'MRP')).toHaveFocus();
        await userEvent.keyboard('{ArrowDown}');
        expect(cell('B3', 'MRP')).toHaveFocus();            // the last row stays put
        await userEvent.keyboard('{ArrowUp}');
        expect(cell('B2', 'MRP')).toHaveFocus();
        await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
        expect(cell('B1', 'MRP')).toHaveFocus();
    });

    it('edits several batches at once and saves each with ONLY what changed', async () => {
        const p = setup();
        await type(cell('B1', 'MRP'), '110');
        await type(cell('B2', 'Pack size'), '12');
        await type(cell('B2', 'Rack'), 'A1');
        expect(cell('B1', 'MRP')).toHaveAttribute('title', 'Was ₹100');                       // a changed cell remembers its old value
        expect(screen.getByText(/2 batches changed/)).toBeInTheDocument();
        expect(screen.getByText(/3 cells/)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('checkbox'));                                  // the pack-size confirmation
        await userEvent.click(saveButton());

        await waitFor(() => expect(p.onSaveBatch).toHaveBeenCalledTimes(2));
        expect(p.onSaveBatch).toHaveBeenCalledWith('b1', { mrp: 110 });
        expect(p.onSaveBatch).toHaveBeenCalledWith('b2', { packSize: 12, rackLocation: 'A1' });
        await waitFor(() => expect(p.onExit).toHaveBeenCalled());
        expect(p.onSaved).toHaveBeenCalledTimes(1);                                           // ONE refresh after all of them
    });

    it('an edit put back is not a change', async () => {
        setup();
        await type(cell('B1', 'MRP'), '999');
        await type(cell('B1', 'MRP'), '100');
        expect(screen.getByText(/No changes yet/)).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    it('Ctrl+D copies the cell above', async () => {
        const p = setup();
        await type(cell('B1', 'Rack'), 'R-7');
        cell('B2', 'Rack').focus();
        await userEvent.keyboard('{Control>}d{/Control}');
        expect(cell('B2', 'Rack').value).toBe('R-7');
        await userEvent.click(saveButton());
        await waitFor(() => expect(p.onSaveBatch).toHaveBeenCalledTimes(2));
    });

    it('pasting a column from Excel fills down from the current row', () => {
        setup();
        fireEvent.paste(cell('B1', 'MRP'), { clipboardData: { getData: () => '111\r\n122\r\n133\r\n' } });
        expect([cell('B1', 'MRP').value, cell('B2', 'MRP').value, cell('B3', 'MRP').value]).toEqual(['111', '122', '133']);
    });

    it('a paste longer than the table is cut off, and a single value pastes normally', () => {
        setup();
        fireEvent.paste(cell('B2', 'MRP'), { clipboardData: { getData: () => '1\n2\n3\n4' } });
        expect([cell('B2', 'MRP').value, cell('B3', 'MRP').value]).toEqual(['1', '2']);
        const single = fireEvent.paste(cell('B1', 'MRP'), { clipboardData: { getData: () => '77' } });
        expect(single).toBe(true);                                                             // not prevented: the browser pastes it
    });

    it('marks a bad cell as soon as it is typed, blocks the save and says why', async () => {
        const p = setup();
        await type(cell('B1', 'MRP'), '0');
        expect(cell('B1', 'MRP')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent(/1 cell needs fixing/);
        expect(screen.getByRole('alert')).toHaveTextContent(/B1: MRP must be greater than 0/);
        await userEvent.click(saveButton());
        expect(p.onSaveBatch).not.toHaveBeenCalled();
        expect(cell('B1', 'MRP')).toHaveFocus();                                              // it takes you to the problem
    });

    it('refuses a pack size that is not a whole number', async () => {
        const p = setup();
        await type(cell('B1', 'Pack size'), '2.5');
        expect(cell('B1', 'Pack size')).toHaveAttribute('aria-invalid', 'true');
        await userEvent.click(saveButton());
        expect(p.onSaveBatch).not.toHaveBeenCalled();
    });

    it('flags two rows with the same batch number', async () => {
        setup();
        await type(cell('B2', 'Batch no'), 'b1');
        expect(cell('B2', 'Batch no')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent(/Another batch of this product has this number/);
    });

    it('asks for a confirmation before changing a pack size, and does not save without it', async () => {
        const p = setup();
        await type(cell('B1', 'Pack size'), '20');
        await userEvent.click(saveButton());
        expect(p.onSaveBatch).not.toHaveBeenCalled();
        expect(screen.getByText(/re-counts that batch/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('checkbox'));
        await userEvent.click(saveButton());
        await waitFor(() => expect(p.onSaveBatch).toHaveBeenCalledWith('b1', { packSize: 20 }));
    });

    it('does not ask for that confirmation when no pack size changed', async () => {
        setup();
        await type(cell('B1', 'MRP'), '105');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('when one batch is refused, the others still save, the bad row keeps its edit with the server\'s reason, and the grid stays open', async () => {
        const onSaveBatch = jest.fn((id: string) => (id === 'b2'
            ? Promise.reject({ errors: { mrp: 'MRP cannot be 0' } })
            : Promise.resolve({ warnings: [] })));
        const p = setup({ onSaveBatch });
        await type(cell('B1', 'MRP'), '110');
        await type(cell('B2', 'MRP'), '130');
        await userEvent.click(saveButton());

        await waitFor(() => expect(onSaveBatch).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(cell('B2', 'MRP')).toHaveAttribute('aria-invalid', 'true'));
        expect(cell('B2', 'MRP').value).toBe('130');                                         // the edit is still there to fix
        expect(cell('B2', 'MRP')).toHaveAttribute('title', 'MRP cannot be 0');
        expect(screen.getByRole('alert')).toHaveTextContent(/B2: MRP cannot be 0/);
        expect(screen.getByText(/1 batch changed/)).toBeInTheDocument();                     // B1 is saved and no longer pending
        expect(p.onExit).not.toHaveBeenCalled();
        expect(p.onSaved).toHaveBeenCalledTimes(1);
    });

    it('a refusal that names no cell is shown on the row', async () => {
        const p = setup({ onSaveBatch: jest.fn().mockRejectedValue(new Error('Server is down')) });
        await type(cell('B1', 'MRP'), '110');
        await userEvent.click(saveButton());
        await waitFor(() => expect(screen.getAllByRole('alert').some((a) => /Server is down|Not saved|went wrong/i.test(a.textContent || ''))).toBe(true));
        expect(p.onExit).not.toHaveBeenCalled();
    });

    it('Discard throws the edits away and sends nothing', async () => {
        const p = setup();
        await type(cell('B1', 'MRP'), '110');
        await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(p.onSaveBatch).not.toHaveBeenCalled();
        expect(p.onExit).toHaveBeenCalled();
    });

    it('the bar lists exactly what will change', async () => {
        setup();
        await type(cell('B1', 'MRP'), '110');
        await userEvent.click(screen.getByText(/1 batch changed/));
        const list = screen.getByRole('list');
        expect(within(list).getByText('B1')).toBeInTheDocument();
        expect(list).toHaveTextContent('MRP ₹100 →to ₹110');       // the "to" is the screen-reader text beside the arrow
    });

    it('points out batches whose pack sizes disagree, and marks the odd one', () => {
        setup({ batches: [batch('b1'), batch('b2', { packSize: 15 })] });
        expect(screen.getByRole('status')).toHaveTextContent(/do not all have the same pack size/);
        expect(within(cell('B2', 'Pack size').parentElement!).getByRole('img', { name: /different from the other batches/ })).toBeInTheDocument();
        expect(within(cell('B1', 'Pack size').parentElement!).queryByRole('img')).not.toBeInTheDocument();
    });

    it('does not nag when all pack sizes agree', () => {
        setup();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('warns (but allows) an MRP below cost', async () => {
        const p = setup();
        await type(cell('B1', 'MRP'), '40');
        expect(cell('B1', 'MRP')).toHaveAttribute('title', 'Was ₹100');
        await userEvent.click(saveButton());
        await waitFor(() => expect(p.onSaveBatch).toHaveBeenCalledWith('b1', { mrp: 40 }));
    });

    it('warns before the page is closed with unsaved edits', async () => {
        setup();
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);                                           // nothing to lose yet
        await type(cell('B1', 'MRP'), '110');
        const second = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(second);
        expect(second.defaultPrevented).toBe(true);
    });
});
