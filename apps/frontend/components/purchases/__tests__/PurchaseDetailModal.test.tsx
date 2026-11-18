import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseDetailModal } from '../PurchaseDetailModal';

const push = jest.fn();
let mockFull: any;
let mockLoading = false;
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/hooks/usePurchases', () => ({ usePurchaseById: () => ({ data: mockFull, isLoading: mockLoading }) }));
jest.mock('@/store/authStore', () => ({ useAuthStore: () => ({ outlet: { name: 'SAI MEDICAL', state: 'Maharashtra', gstin: '27AAPCM1753L2ZX', address: 'Gahti Road', city: 'Aurangabad', phone: '8484846611', drugLicenseNo: '20-612209' }, user: { role: 'admin' } }) }));
jest.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ outletName: 'SAI MEDICAL', outletState: 'Maharashtra', outletGstin: '27AAPCM1753L2ZX', outletAddress: 'Gahti Road', outletCity: 'Aurangabad', outletPhone: '8484846611', outletDrugLicenseNo: '20-612209' }) }));

const item = (over: any = {}) => ({
    id: 'i1', purchaseId: 'p1', batchNo: 'BTC98', expiryDate: '2029-06-01', pkg: 10, qty: 50, freeQty: 0, packUnitLabel: 'strip', purchaseRate: 50, discountPct: 0, cashDiscountPct: 0,
    gstRate: 18, mrp: 100, taxableAmount: 2500, gstAmount: 450, totalAmount: 2950, hsnCode: '3004', product: { name: 'pj juice', manufacturer: 'lala' }, ...over,
});
const invoice = (over: any = {}) => ({
    id: 'p1', invoiceNo: 'test963', invoiceDate: '2026-11-11', dueDate: '2026-12-11', purchaseType: 'credit', subtotal: 2500, discountAmount: 0, invoiceDiscount: 0, taxableAmount: 2500,
    gstAmount: 450, cessAmount: 0, freight: 0, roundOff: 0, grandTotal: 2950, amountPaid: 0, outstanding: 2950, status: 'POSTED', createdByName: 'Asha',
    distributor: { name: 'A.S.MEDICAL AGENCY', phone: '9923874444', gstin: '27ABCDE1234F1Z5', address: 'Station Road', city: 'Pune', state: 'Maharashtra', drugLicenseNo: 'DL-77' },
    items: [item()], ...over,
});

function setup(inv: any = invoice(), props: any = {}) {
    mockFull = inv;
    const p = { open: true, onOpenChange: jest.fn(), invoice: inv, ...props };
    render(<PurchaseDetailModal {...p} />);
    return p;
}
const doc = () => screen.getByRole('document', { name: /Purchase invoice test963/ });

describe('PurchaseDetailModal (the purchase invoice as a document)', () => {
    beforeAll(() => { (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });
    beforeEach(() => { jest.clearAllMocks(); mockLoading = false; });

    it('has a letterhead, the invoice facts and the supplier and our shop as separate blocks', () => {
        setup();
        const d = within(doc());
        expect(d.getByRole('heading', { name: 'SAI MEDICAL' })).toBeInTheDocument();
        expect(d.getByText('Purchase Invoice')).toBeInTheDocument();
        expect(d.getByText('test963')).toBeInTheDocument();
        expect(d.getByText('11-Nov-2026')).toBeInTheDocument();
        expect(d.getByText('11-Dec-2026')).toBeInTheDocument();
        expect(d.getByText('A.S.MEDICAL AGENCY')).toBeInTheDocument();
        expect(d.getByText(/Ph: 9923874444/)).toHaveTextContent('GSTIN: 27ABCDE1234F1Z5');
        expect(d.getByText('DL No: DL-77')).toBeInTheDocument();
        expect(d.getByText('Received at')).toBeInTheDocument();
    });

    it('lists the items with their batch, expiry as MM/YY, pack, quantity with its unit, MRP, rate, discount, GST and amount', () => {
        setup();
        const row = within(screen.getByRole('table', { name: 'Items on this purchase invoice' })).getAllByRole('row')[1];
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
        expect(cells[0]).toBe('1');
        expect(cells[1]).toContain('pj juice');
        expect(cells[1]).toContain('lala · HSN 3004');
        expect(cells.slice(2)).toEqual(['BTC98', '06/29', '1 × 10', '50 strips', '100.00', '50.00', '0', '18', '2,950.00']);
    });

    it('shows free quantity and cash discount under the line, not hidden', () => {
        setup(invoice({ items: [item({ freeQty: 5, cashDiscountPct: 2, discountPct: 10 })] }));
        expect(screen.getByText('+ 5 free')).toBeInTheDocument();
        expect(screen.getByText('+2 CD')).toBeInTheDocument();
    });

    it('splits the GST into CGST and SGST for a supplier in the same state', () => {
        setup();
        const t = screen.getByRole('table', { name: 'GST summary' });
        expect(within(t).getByRole('columnheader', { name: 'CGST' })).toBeInTheDocument();
        expect(within(t).getByRole('columnheader', { name: 'SGST' })).toBeInTheDocument();
        expect(within(t).queryByRole('columnheader', { name: 'IGST' })).not.toBeInTheDocument();
        expect(within(t).getAllByText('225.00')).toHaveLength(4);        // 18%: CGST and SGST rows, and the totals row
    });

    it('shows one IGST for a supplier in another state', () => {
        setup(invoice({ distributor: { ...invoice().distributor, state: 'Gujarat' } }));
        const t = screen.getByRole('table', { name: 'GST summary' });
        expect(within(t).getByRole('columnheader', { name: 'IGST' })).toBeInTheDocument();
        expect(within(t).queryByRole('columnheader', { name: 'CGST' })).not.toBeInTheDocument();
        expect(within(t).getAllByText('450.00').length).toBeGreaterThan(0);
    });

    it('totals: grand total in figures and in words, paid and outstanding', () => {
        setup(invoice({ amountPaid: 1000, outstanding: 1950, payments: [{ method: 'upi', amount: 1000 }] }));
        const d = within(doc());
        expect(d.getByText('Grand total').parentElement).toHaveTextContent('₹ 2,950.00');
        expect(d.getByText('Rs. Two Thousand Nine Hundred Fifty Only')).toBeInTheDocument();
        expect(d.getByText('Outstanding').parentElement).toHaveTextContent('₹ 1,950.00');
        expect(d.getByText('UPI 1,000.00')).toBeInTheDocument();
    });

    it('shows discounts, freight, round-off and a ledger adjustment only when they exist', () => {
        setup(invoice({ discountAmount: 100, invoiceDiscount: 50, freight: 20, roundOff: -0.4, ledgerAdjustment: -30, ledgerNote: 'old credit' }));
        const d = within(doc());
        expect(d.getByText('Item discounts')).toBeInTheDocument();
        expect(d.getByText(/Invoice discount \(/)).toBeInTheDocument();
        expect(d.getByText('Freight')).toBeInTheDocument();
        expect(d.getByText('Round off').parentElement).toHaveTextContent('− 0.40');
        expect(d.getByText('Ledger adjustment (old credit)').parentElement).toHaveTextContent('+ 30.00');
    });
    it('leaves those lines out when there are none', () => {
        setup();
        const d = within(doc());
        for (const k of ['Item discounts', 'Freight', 'Round off', 'Ledger adjustment', 'Cess']) expect(d.queryByText(k)).not.toBeInTheDocument();
    });

    it('says Loading while the items load, and says so when there are none', () => {
        mockLoading = true;
        setup(invoice({ items: [] }));
        expect(screen.getByText('Loading items…')).toBeInTheDocument();
    });
    it('says when an invoice has no items', () => {
        setup(invoice({ items: [] }));
        expect(screen.getByText('No items found for this invoice.')).toBeInTheDocument();
    });

    it('has signature lines and the notes', () => {
        setup(invoice({ notes: 'Deliver to counter 2' }));
        expect(screen.getByText('Authorised signatory')).toBeInTheDocument();
        expect(screen.getByText('Received by (Asha)')).toBeInTheDocument();
        expect(screen.getByText('Deliver to counter 2')).toBeInTheDocument();
    });

    it('the status is a word on the paper (Unpaid, Paid, Overdue...) and in the header', () => {
        setup();
        expect(within(doc()).getByText('Unpaid')).toBeInTheDocument();
    });

    it('Print / PDF prints this page', async () => {
        const print = jest.spyOn(window, 'print').mockImplementation(() => {});
        setup();
        await userEvent.click(screen.getByRole('button', { name: /print \/ pdf/i }));
        expect(print).toHaveBeenCalledTimes(1);
    });

    it('History and Return close the preview and go to their pages', async () => {
        const p = setup();
        await userEvent.click(screen.getByRole('button', { name: /history/i }));
        expect(p.onOpenChange).toHaveBeenCalledWith(false);
        expect(push).toHaveBeenCalledWith('/dashboard/purchases/revisions/p1');
        await userEvent.click(screen.getByRole('button', { name: /return/i }));
        expect(push).toHaveBeenCalledWith('/dashboard/accounts/purchase-returns/new?invoiceNo=test963');
    });

    it('Edit is offered only when the caller can edit, and passes the invoice', async () => {
        const onEdit = jest.fn();
        setup(invoice(), { onEdit });
        await userEvent.click(screen.getByTestId('btn-edit-purchase'));
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    });
    it('no Edit button without an onEdit', () => {
        setup();
        expect(screen.queryByTestId('btn-edit-purchase')).not.toBeInTheDocument();
    });

    it('prints the same element it shows (one page, not a second hidden copy)', () => {
        setup();
        expect(document.querySelectorAll('#purchase-print-root')).toHaveLength(1);
    });
});
