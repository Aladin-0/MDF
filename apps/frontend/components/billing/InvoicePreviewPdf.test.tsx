import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { InvoicePreviewModal } from './InvoicePreviewModal';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ printerType: 'a4' }) }));
jest.mock('@/store/authStore', () => ({ useAuthStore: (sel: any) => sel({ outlet: null, user: { name: 'Asha' } }) }));
jest.mock('@/store/billingStore', () => ({ useBillingStore: () => null }));
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => ({ settings: null }) }));
jest.mock('./InvoiceThermal', () => ({ InvoiceThermal: () => null }));
jest.mock('@/components/print/ManavataA4Invoice', () => ({ ManavataA4Invoice: () => <div>A4 INVOICE</div> }));

describe('InvoicePreviewModal: PDF', () => {
    beforeAll(() => { (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });

    it('the PDF button opens the print window (where "Save as PDF" downloads it); it used to do nothing', () => {
        const print = jest.spyOn(window, 'print').mockImplementation(() => {});
        render(<InvoicePreviewModal isOpen onClose={jest.fn()} invoice={{ id: 'i1', invoiceNo: 'INV-1' } as any} />);
        fireEvent.click(screen.getByRole('button', { name: /pdf/i }));
        expect(print).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: /print/i }));
        expect(print).toHaveBeenCalledTimes(2);
    });
});
