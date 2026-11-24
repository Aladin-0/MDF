import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/dashboard/purchases' }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));
jest.mock('@/hooks/usePO', () => ({ useOpenPOs: () => ({ data: { results: [] } }), useInvalidatePO: () => jest.fn() }));
jest.mock('@/hooks/usePurchases', () => ({
    useCreatePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUpdatePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useConfirmDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCheckDuplicateInvoice: () => ({ data: null }),
}));
jest.mock('@/hooks/useProductSearch', () => ({ useProductSearch: () => ({ data: [], isFetching: false }) }));
jest.mock('@/components/accounts/LedgerPicker', () => ({ LedgerPicker: ({ placeholder }: any) => <input aria-label="Party" placeholder={placeholder} /> }));
jest.mock('@/components/purchases/AddNewProductDrawer', () => ({ AddNewProductDrawer: () => null }));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({}), productsApi: { search: jest.fn().mockResolvedValue([]) }, inventoryApi: {} }));
// every purchase line calls this once per render: a handy counter of line renders
const mockRowRenders = jest.fn();
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => { mockRowRenders(); return { data: undefined }; } }));

import { NewPurchaseForm } from '../NewPurchaseForm';

const renderForm = () => render(<QueryClientProvider client={new QueryClient()}><NewPurchaseForm onSuccess={jest.fn()} /></QueryClientProvider>);

describe('New Purchase grid: typing re-draws only what changed', () => {
    beforeEach(() => {
        renderForm();
        for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByTestId('add-row-bottom'));   // 6 lines
        expect(screen.getAllByLabelText(/^Qty \(packs\), medicine \d+$/)).toHaveLength(6);
        mockRowRenders.mockClear();
    });

    it('typing in one line re-draws that line only (it re-drew every line on every key)', () => {
        fireEvent.change(screen.getByLabelText('Qty (packs), medicine 3'), { target: { value: '12' } });
        expect(screen.getByLabelText('Qty (packs), medicine 3')).toHaveValue(12);
        expect(mockRowRenders).toHaveBeenCalledTimes(1);
    });

    it('typing in a header field re-draws no line at all', () => {
        fireEvent.change(screen.getByPlaceholderText('e.g. AJD-2026-0123'), { target: { value: 'INV-77' } });
        expect(screen.getByPlaceholderText('e.g. AJD-2026-0123')).toHaveValue('INV-77');
        expect(mockRowRenders).toHaveBeenCalledTimes(0);
    });

    it('the handlers still act on the latest lines (stable identity, current logic)', () => {
        fireEvent.change(screen.getByLabelText('Qty (packs), medicine 2'), { target: { value: '5' } });
        fireEvent.change(screen.getByLabelText('Qty (packs), medicine 6'), { target: { value: '9' } });
        expect(screen.getByLabelText('Qty (packs), medicine 2')).toHaveValue(5);
        expect(screen.getByLabelText('Qty (packs), medicine 6')).toHaveValue(9);
        fireEvent.change(screen.getByLabelText('Qty (packs), medicine 2'), { target: { value: '7' } });
        expect(screen.getByLabelText('Qty (packs), medicine 2')).toHaveValue(7);
        expect(screen.getByLabelText('Qty (packs), medicine 6')).toHaveValue(9);   // an old closure would have reset it
    });
});
