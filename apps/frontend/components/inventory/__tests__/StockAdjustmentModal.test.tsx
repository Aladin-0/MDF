import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockAdjustmentModal } from '../StockAdjustmentModal';

const mockToast = jest.fn();
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/apiClient', () => ({ inventoryApi: { adjustStock: jest.fn() } }));

const strip = { id: 'b1', batchNo: 'B123', expiryDate: '2027-06-30', qtyStrips: 5, qtyLoose: 3, packSize: 10, packType: 'strip', packUnit: 'tablet', allowsLoose: true };
const bottle = { id: 'b9', batchNo: 'SYR1', expiryDate: '2027-06-30', qtyStrips: 4, qtyLoose: 0, packSize: 1, packType: 'bottle', packUnit: 'piece', allowsLoose: false };

function open(props: Partial<React.ComponentProps<typeof StockAdjustmentModal>> = {}) {
    const onSubmit = jest.fn().mockResolvedValue({ success: true });
    const onClose = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <StockAdjustmentModal isOpen batch={strip} productName="Dolo 650" onClose={onClose} onSubmit={onSubmit} {...props} />
        </QueryClientProvider>,
    );
    return { onSubmit, onClose };
}

const fill = async (qty: string, reason = 'Broken in transit', pin = '4321') => {
    if (qty) await userEvent.type(screen.getByLabelText('Quantity'), qty);
    if (reason) await userEvent.type(screen.getByLabelText('Reason'), reason);
    if (pin) await userEvent.type(screen.getByLabelText('Staff PIN'), pin);
};
const submit = () => userEvent.click(screen.getByRole('button', { name: /^(remove|add)/i }));

describe('StockAdjustmentModal', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends exactly what the endpoint needs: type, signed qty, unit, reason and PIN (it sent none of type/qty/pin before, so every adjustment failed)', async () => {
        const { onSubmit, onClose } = open();
        await fill('4');
        await submit();
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit).toHaveBeenCalledWith({ batchId: 'b1', outletId: 'o1', type: 'damage', qty: -4, adjustUnit: 'strips', reason: 'Broken in transit', pin: '4321' });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Stock adjusted' }));
    });

    it('shows what the stock will be before you confirm', async () => {
        open();
        await userEvent.type(screen.getByLabelText('Quantity'), '4');
        expect(screen.getByText(/stock after this/i).textContent).toMatch(/1 strip \+ 3 tablets/);
    });

    it('refuses to go below zero and does not call the server', async () => {
        const { onSubmit } = open();
        await fill('6');
        expect(screen.getByText(/would take the stock below zero/i)).toBeInTheDocument();
        await submit();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(await screen.findByText(/below zero/i, { selector: 'p[role="alert"]' })).toBeInTheDocument();
    });

    it('asks for the quantity, a reason and a PIN, and says which is missing', async () => {
        const { onSubmit } = open();
        await submit();
        expect(await screen.findByText('Enter at least 1')).toBeInTheDocument();
        expect(screen.getByText(/please give a reason/i)).toBeInTheDocument();
        expect(screen.getByText(/enter your staff pin/i)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('offers loose units only for a pack that can be split, and sends them as loose', async () => {
        const { onSubmit } = open();
        const unit = screen.getByRole('group', { name: 'Unit' });
        await userEvent.click(within(unit).getByRole('button', { name: /tablets/i }));
        await fill('5');
        await submit();
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ qty: -5, adjustUnit: 'loose' });
    });

    it('hides the unit choice for a pack that is sold whole (a bottle)', () => {
        open({ batch: bottle });
        expect(screen.queryByRole('group', { name: 'Unit' })).not.toBeInTheDocument();
    });

    it('a patient return always adds, a correction goes the way you choose', async () => {
        const { onSubmit } = open();
        await userEvent.click(screen.getByLabelText(/patient return/i));
        await fill('2', 'Unused strips returned');
        await userEvent.click(screen.getByRole('button', { name: /^add 2/i }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'return_from_patient', qty: 2 });
    });

    it('a stock correction lets you choose to remove', async () => {
        const { onSubmit } = open();
        await userEvent.click(screen.getByLabelText(/stock correction/i));
        await userEvent.click(screen.getByRole('button', { name: /count is short/i }));
        await fill('1', 'Counted one short');
        await submit();
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'correction', qty: -1 });
    });

    it('a wrong PIN is shown on the PIN field and the dialog stays open', async () => {
        const onSubmit = jest.fn().mockRejectedValue({ error: { code: 'INVALID_PIN', message: 'Invalid PIN' } });
        const { onClose } = open({ onSubmit });
        await fill('1', 'Broken', '0000');
        await submit();
        expect(await screen.findByText(/pin was not recognised/i)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('any other server refusal is shown, and says nothing was changed', async () => {
        const onSubmit = jest.fn().mockRejectedValue({ detail: 'Stock cannot go below 0.' });
        const { onClose } = open({ onSubmit });
        await fill('1');
        await submit();
        expect(await screen.findByText(/stock cannot go below 0\. nothing was changed/i)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('lets you choose the batch when a product has several, starting on the one you clicked', () => {
        const second = { ...strip, id: 'b2', batchNo: 'B456' };
        open({ batch: second, batches: [strip, second] });
        expect(screen.getByLabelText('Which batch?')).toBeInTheDocument();
        expect(screen.getAllByText(/B456/).length).toBeGreaterThan(0);
    });

    it('has no batch picker for a single batch, and renders nothing when closed', () => {
        const { onClose } = open({ batches: [strip] });
        expect(screen.queryByLabelText('Which batch?')).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('StockAdjustmentModal when closed', () => {
    it('renders nothing', () => {
        const client = new QueryClient();
        const { container } = render(<QueryClientProvider client={client}><StockAdjustmentModal isOpen={false} batch={strip} onClose={() => {}} /></QueryClientProvider>);
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
