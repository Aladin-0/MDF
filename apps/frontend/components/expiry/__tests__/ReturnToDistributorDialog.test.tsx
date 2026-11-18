import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { ReturnToDistributorDialog } from '../ReturnToDistributorDialog';
import { row } from '../testing/fixtures';

describe('ReturnToDistributorDialog', () => {
    it('makes one debit note per purchase invoice and opens the return screen with only those batches', () => {
        render(<ReturnToDistributorDialog onClose={jest.fn()} rows={[
            row('a'), row('b'),
            row('c', { purchaseInvoiceId: 'inv2', purchaseInvoiceNo: 'B-9', distributorName: 'Beta Pharma', distributorId: 'd2' }),
        ]} />);
        const links = screen.getAllByRole('link', { name: /Make debit note/ });
        expect(links).toHaveLength(2);
        const first = new URL(links[0].getAttribute('href')!, 'http://x');
        expect(first.pathname).toBe('/dashboard/accounts/purchase-returns/new');
        expect(first.searchParams.get('invoiceId')).toBe('inv1');
        expect(first.searchParams.get('batchIds')).toBe('a,b');
        expect(screen.getByText('Invoice A-1 · 2 batches')).toBeInTheDocument();
    });

    it('says which batches cannot be returned, and why', () => {
        render(<ReturnToDistributorDialog onClose={jest.fn()} rows={[row('x', { purchaseInvoiceId: null, purchaseInvoiceNo: '', distributorId: null, distributorName: '' })]} />);
        expect(screen.queryByRole('link', { name: /Make debit note/ })).not.toBeInTheDocument();
        const section = screen.getByText('Cannot be returned from here').parentElement!;
        expect(within(section).getByText(/Medicine X/)).toBeInTheDocument();
        expect(within(section).getByText(/no purchase record/)).toBeInTheDocument();
    });
});
