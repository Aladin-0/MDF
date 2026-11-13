import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SuccessView } from './SuccessView';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Ravi' } }) }));

const invoice = { id: 'inv-9', invoiceNo: 'INV-2026-001742', grandTotal: 1038, paymentMode: 'cash', createdAt: '2026-11-12T10:15:00', billedByName: 'Meera' };

function setup(inv: any = invoice) {
    const cbs = { onNewBill: jest.fn(), onPrint: jest.fn(), onViewInvoice: jest.fn() };
    render(<SuccessView invoice={inv} {...cbs} />);
    return cbs;
}

const setShare = (fn: any) => Object.defineProperty(window.navigator, 'share', { configurable: true, writable: true, value: fn });
const setClipboard = (writeText: any) => Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });

beforeEach(() => {
    jest.clearAllMocks();
    setShare(undefined);
    setClipboard(jest.fn().mockResolvedValue(undefined));
});

describe('SuccessView', () => {
    it('shows the saved bill: number, amount, mode, time, billed by', () => {
        setup();
        expect(screen.getByTestId('invoice-success')).toBeInTheDocument();
        expect(screen.getByText('Bill saved')).toBeInTheDocument();
        expect(screen.getByTestId('invoice-number')).toHaveTextContent('INV-2026-001742');
        expect(screen.getByTestId('invoice-amount')).toHaveTextContent('₹1,038.00');
        expect(screen.getByText('CASH')).toBeInTheDocument();
        expect(screen.getByText(/10:15 AM, 12 Nov 2026/)).toBeInTheDocument();
        expect(screen.getByText('Meera')).toBeInTheDocument();
    });

    it('falls back to the signed-in user when the invoice has no billed-by name', () => {
        setup({ ...invoice, billedByName: undefined });
        expect(screen.getByText('Ravi')).toBeInTheDocument();
    });

    it('every button is at least 52px tall', () => {
        setup();
        for (const b of screen.getAllByRole('button')) expect(b.className).toMatch(/min-h-\[(52|56)px\]/);
    });

    it('Print, New bill and View invoice call their callbacks', () => {
        const cbs = setup();
        fireEvent.click(screen.getByRole('button', { name: /Print/ }));
        fireEvent.click(screen.getByRole('button', { name: /New bill/ }));
        fireEvent.click(screen.getByRole('button', { name: /View invoice/ }));
        expect(cbs.onPrint).toHaveBeenCalledTimes(1);
        expect(cbs.onNewBill).toHaveBeenCalledTimes(1);
        expect(cbs.onViewInvoice).toHaveBeenCalledTimes(1);
    });

    it('Share uses the Web Share API with the invoice number, amount and link', async () => {
        const share = jest.fn().mockResolvedValue(undefined);
        setShare(share);
        setup();
        fireEvent.click(screen.getByRole('button', { name: /Share/ }));
        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
        const arg = share.mock.calls[0][0];
        expect(arg.title).toContain('INV-2026-001742');
        expect(arg.text).toContain('INV-2026-001742');
        expect(arg.text).toContain('1,038.00');
        expect(arg.text).toContain('/billing/inv-9');
        expect(toast).not.toHaveBeenCalled();
    });

    it('Share falls back to copying the text and says "Link copied" when Web Share is missing', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);
        setup();
        fireEvent.click(screen.getByRole('button', { name: /Share/ }));
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Link copied' }));
        expect(writeText.mock.calls[0][0]).toContain('INV-2026-001742');
        expect(writeText.mock.calls[0][0]).toContain('/billing/inv-9');
    });

    it('also copies when Web Share throws (not when the cashier just cancels it)', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);
        setShare(jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })));
        setup();
        fireEvent.click(screen.getByRole('button', { name: /Share/ }));
        await new Promise((r) => setTimeout(r, 0));
        expect(writeText).not.toHaveBeenCalled();           // cancelled: nothing more to do

        setShare(jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { name: 'NotAllowedError' })));
        fireEvent.click(screen.getByRole('button', { name: /Share/ }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    });

    it('without an invoice id the text has no link', async () => {
        const share = jest.fn().mockResolvedValue(undefined);
        setShare(share);
        setup({ ...invoice, id: undefined });
        fireEvent.click(screen.getByRole('button', { name: /Share/ }));
        await waitFor(() => expect(share).toHaveBeenCalled());
        expect(share.mock.calls[0][0].text).not.toContain('/billing/');
    });

    it('WhatsApp opens wa.me with the same plain text', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        setup();
        fireEvent.click(screen.getByRole('button', { name: /WhatsApp/ }));
        const url = open.mock.calls[0][0] as string;
        expect(url.startsWith('https://wa.me/?text=')).toBe(true);
        const text = decodeURIComponent(url.split('text=')[1]);
        expect(text).toContain('Your invoice INV-2026-001742 from MediFlow Pharmacy');
        expect(text).toContain('/billing/inv-9');
        open.mockRestore();
    });
});
