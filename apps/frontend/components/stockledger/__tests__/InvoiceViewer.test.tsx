import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceViewer } from '../InvoiceViewer';
import { usePurchaseById } from '@/hooks/usePurchases';
import { useSaleById } from '@/hooks/useSales';

jest.mock('@/hooks/useSales', () => ({ useSaleById: jest.fn() }));
jest.mock('@/hooks/usePurchases', () => ({ usePurchaseById: jest.fn() }));
// the real previews have their own tests; stand-ins keep this about WHICH one opens and what shows while it loads
jest.mock('@/components/billing/InvoicePreviewModal', () => ({ InvoicePreviewModal: ({ invoice, onClose }: any) => <div role="dialog" aria-label="sale preview">SALE {invoice.invoiceNo}<button onClick={onClose}>close sale</button></div> }));
jest.mock('@/components/purchases/PurchaseDetailModal', () => ({ PurchaseDetailModal: ({ invoice, onOpenChange }: any) => <div role="dialog" aria-label="purchase preview">PURCHASE {invoice.invoiceNo}<button onClick={() => onOpenChange(false)}>close purchase</button></div> }));

const sale = useSaleById as jest.Mock;
const purchase = usePurchaseById as jest.Mock;
const state = (over: any = {}) => ({ data: undefined, isLoading: false, error: null, refetch: jest.fn(), ...over });

describe('InvoiceViewer', () => {
    it('opens a sale in the sales preview', async () => {
        sale.mockReturnValue(state({ data: { invoiceNo: 'INV-9' } }));
        const onClose = jest.fn();
        render(<InvoiceViewer target={{ kind: 'sale', id: 's1' }} onClose={onClose} />);
        expect(screen.getByRole('dialog', { name: 'sale preview' })).toHaveTextContent('SALE INV-9');
        expect(sale).toHaveBeenCalledWith('s1');
        await userEvent.click(screen.getByText('close sale'));
        expect(onClose).toHaveBeenCalled();
    });

    it('opens a purchase in the purchase preview, and closing it closes the viewer', async () => {
        purchase.mockReturnValue(state({ data: { invoiceNo: 'PINV-7' } }));
        const onClose = jest.fn();
        render(<InvoiceViewer target={{ kind: 'purchase', id: 'p1' }} onClose={onClose} />);
        expect(screen.getByRole('dialog', { name: 'purchase preview' })).toHaveTextContent('PURCHASE PINV-7');
        expect(purchase).toHaveBeenCalledWith('p1');
        await userEvent.click(screen.getByText('close purchase'));
        expect(onClose).toHaveBeenCalled();
    });

    it('says it is opening while it loads', () => {
        sale.mockReturnValue(state({ isLoading: true }));
        render(<InvoiceViewer target={{ kind: 'sale', id: 's1' }} onClose={jest.fn()} />);
        expect(screen.getByRole('status')).toHaveTextContent('Opening the invoice');
    });

    it('says why it cannot open, and can try again', async () => {
        const refetch = jest.fn();
        purchase.mockReturnValue(state({ error: { detail: 'Not found' }, refetch }));
        render(<InvoiceViewer target={{ kind: 'purchase', id: 'p1' }} onClose={jest.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent(/Not found/);
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refetch).toHaveBeenCalled();
    });
});
