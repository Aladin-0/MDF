import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditBatchModal } from '../product/EditBatchModal';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const batch = {
    id: 'b1', batchNo: 'B100', expiryDate: '2027-09-01', mfgDate: null, mrp: 250, purchaseRate: 180, landingRate: 200,
    rackLocation: null, packSize: 10, packType: 'strip', packUnit: 'tablet', qtyStrips: 10, qtyLoose: 0,
};

function open(over: Partial<React.ComponentProps<typeof EditBatchModal>> = {}) {
    const onSave = jest.fn().mockResolvedValue({ changed: [], warnings: [] });
    const onClose = jest.fn();
    render(<EditBatchModal batch={batch} productName="Dolo 650" showRates onSave={onSave} onClose={onClose} {...over} />);
    return { onSave, onClose };
}
const type = async (label: string, value: string) => {
    const input = screen.getByLabelText(label);
    await userEvent.clear(input);
    if (value) await userEvent.type(input, value);
};
const save = () => userEvent.click(screen.getByRole('button', { name: /^save \d+ change/i }));
const undoOf = (call = 0) => mockToast.mock.calls[call][0].action.props.onClick as () => void;

describe('EditBatchModal', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(() => jest.clearAllMocks());

    it('opens with nothing changed: the save button says so and is disabled', () => {
        open();
        expect(screen.getByRole('button', { name: 'No Changes Yet' })).toBeDisabled();
        expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
        expect(screen.getByText(/to change the quantity use adjust/i)).toBeInTheDocument();
    });

    it('lists what will change as you type, with the count on the button', async () => {
        open();
        await type('MRP', '260');
        await type('Rack', 'A1');
        const summary = screen.getByText('What will change').parentElement as HTMLElement;
        expect(within(summary).getByText(/mrp:/i).parentElement?.textContent).toMatch(/MRP:\s*₹250.*₹260/);
        expect(within(summary).getByText(/rack:/i).parentElement?.textContent).toMatch(/Rack:\s*none.*A1/);
        expect(screen.getByRole('button', { name: 'Save 2 Changes' })).toBeEnabled();
    });

    it('sends ONLY the fields that changed, then offers Undo on the saved message', async () => {
        const { onSave, onClose } = open();
        await type('MRP', '260');
        await save();
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave).toHaveBeenCalledWith('b1', { mrp: 260 });
        expect(onClose).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Batch B100 updated', description: expect.stringContaining('MRP ₹250 → ₹260') }));

        undoOf()();                                                     // press Undo
        await waitFor(() => expect(onSave).toHaveBeenLastCalledWith('b1', { mrp: 250 }));
        await waitFor(() => expect(mockToast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Change undone' })));
    });

    it('shows the server\'s warnings (selling below cost) on the saved message', async () => {
        const onSave = jest.fn().mockResolvedValue({ warnings: ['MRP ₹150 is below the cost ₹200: this batch will sell at a loss.'] });
        open({ onSave });
        await type('MRP', '150');
        await save();
        await waitFor(() => expect(mockToast).toHaveBeenCalled());
        expect(mockToast.mock.calls[0][0].description).toContain('will sell at a loss');
    });

    it('warns while typing when the MRP is below the cost, but still lets you save', async () => {
        const { onSave } = open();
        await type('MRP', '150');
        expect(screen.getByRole('status')).toHaveTextContent(/below the cost/i);
        await save();
        await waitFor(() => expect(onSave).toHaveBeenCalledWith('b1', { mrp: 150 }));
    });

    it('stops bad input before it reaches the server and puts the cursor on the first problem', async () => {
        const { onSave } = open();
        fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '' } });   // the server used to crash on this
        await type('MRP', '0');
        await save();
        expect(await screen.findByText('Expiry date is required')).toBeInTheDocument();
        expect(screen.getByText('MRP must be greater than 0')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Batch no')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText('Expiry date')).toHaveFocus());
    });

    it('refuses a manufacturing date after the expiry', async () => {
        const { onSave } = open();
        fireEvent.change(screen.getByLabelText('Mfg date'), { target: { value: '2028-01-01' } });
        await save();
        expect(await screen.findByText('Must be before the expiry date')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('shows the server\'s refusal next to the field and keeps the form open', async () => {
        const onSave = jest.fn().mockRejectedValue({ errors: { batchNo: 'Batch NEW already exists for this product. To move stock between batches, adjust the stock instead of renaming.' } });
        const { onClose } = open({ onSave });
        await type('Batch no', 'NEW');
        await save();
        expect(await screen.findByText(/batch new already exists/i)).toBeInTheDocument();
        expect(screen.getByLabelText('Batch no')).toHaveAttribute('aria-invalid', 'true');
        expect(onClose).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('any other failure says nothing was saved', async () => {
        const onSave = jest.fn().mockRejectedValue({ detail: 'Server error' });
        const { onClose } = open({ onSave });
        await type('MRP', '260');
        await save();
        expect(await screen.findByText(/server error\. nothing was saved/i)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not show purchase or landing rates to people who may not see them', async () => {
        const { onSave } = open({ showRates: false });
        expect(screen.queryByLabelText('Purchase rate')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Landing rate')).not.toBeInTheDocument();
        expect(screen.getByLabelText('MRP')).toBeInTheDocument();
        await type('MRP', '260');
        await save();
        await waitFor(() => expect(onSave).toHaveBeenCalledWith('b1', { mrp: 260 }));
    });

    it('keeps the risky pack fields folded away, and needs an explicit tick to change them', async () => {
        const { onSave } = open();
        const toggle = screen.getByRole('button', { name: /pack details/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByLabelText('Pack size')).not.toBeInTheDocument();

        await userEvent.click(toggle);
        expect(screen.getByText('this batch', { selector: 'strong' })).toBeInTheDocument();
        await type('Pack size', '12');
        await save();
        expect(await screen.findByText(/tick the box below/i)).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();

        await userEvent.click(screen.getByLabelText(/i understand this changes how the stock/i));
        await save();
        await waitFor(() => expect(onSave).toHaveBeenCalledWith('b1', { packSize: 12 }));
    });

    it('Cancel closes without saving', async () => {
        const { onSave, onClose } = open();
        await type('MRP', '999');
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalled();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('renders nothing when there is no batch', () => {
        const { container } = render(<EditBatchModal batch={null} productName="x" showRates onSave={jest.fn()} onClose={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});
