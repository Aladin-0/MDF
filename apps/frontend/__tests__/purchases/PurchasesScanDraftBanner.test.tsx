import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    usePathname: () => '/dashboard/purchases',
    useSearchParams: () => new URLSearchParams(''),
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/hooks/usePO', () => ({
    useShortbook: () => ({ data: { counts: { pending: 0 }, results: [] } }),
    usePOList: () => ({ data: { statusCounts: {}, results: [] } }),
    useInvalidatePO: () => jest.fn(),
}));
// The list mock exposes the two ways the purchase form gets opened.
jest.mock('@/components/purchases/PurchasesList', () => ({
    PurchasesList: ({ onScanSuccess, onEditInvoice }: any) => (
        <div>
            <button onClick={() => onScanSuccess('draft-1')}>simulate scan</button>
            <button onClick={() => onEditInvoice({ id: 'inv-9', invoiceNo: 'BDS32153', status: 'POSTED' })}>simulate edit</button>
        </div>
    ),
}));
jest.mock('@/components/purchases/NewPurchaseForm', () => ({ NewPurchaseForm: () => <div>purchase-form</div> }));
jest.mock('@/components/purchases/DistributorsTab', () => ({ DistributorsTab: () => null }));
jest.mock('@/components/purchases/PurchaseOrdersList', () => ({ PurchaseOrdersList: () => null }));
jest.mock('@/components/purchases/ShortbookTab', () => ({ ShortbookTab: () => null, AddToShortbook: () => null }));
jest.mock('@/components/purchases/NewPurchaseOrderModal', () => ({ NewPurchaseOrderModal: () => null }));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({}), inventoryApi: { getStock: jest.fn() } }));

import PurchasesPage from '@/app/dashboard/purchases/page';
import { useAuthStore } from '@/store/authStore';

beforeEach(() => {
    useAuthStore.setState({ user: { id: 'u', role: 'admin', permissions: ['view_purchases', 'create_purchases', 'edit_purchases'], outlet: { id: 'o1' } } as never });
});

const openInvoicesTab = () => fireEvent.click(screen.getAllByRole('button', { name: /^Invoices/ })[0]);

describe('Purchases page: scanned bill vs editing a saved invoice', () => {
    it('a scanned bill is a NEW purchase: no "editing invoice" banner, tab says Review Scanned Bill', () => {
        render(<PurchasesPage />);
        openInvoicesTab();
        fireEvent.click(screen.getByText('simulate scan'));
        expect(screen.getByText('purchase-form')).toBeInTheDocument();
        expect(screen.queryByText(/editing/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Edit Purchase/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Review Scanned Bill/ })).toBeInTheDocument();
    });

    it('editing a saved invoice still shows the editing banner and the Edit Purchase tab', () => {
        render(<PurchasesPage />);
        openInvoicesTab();
        fireEvent.click(screen.getByText('simulate edit'));
        expect(screen.getByText(/Changes will be synced/)).toBeInTheDocument();
        expect(screen.getByText('BDS32153')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Edit Purchase/ })).toBeInTheDocument();
    });
});
