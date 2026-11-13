/**
 * Production bug: on a scanned bill, picking a product for a row and pressing
 * Save straight away failed with "Product selection from catalog is required"
 * although the row showed the product (grid state and form value were out of sync).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();
const mutateAsync = jest.fn().mockResolvedValue({ id: 'posted-1' });
const mockToast = jest.fn();

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
jest.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn() } }));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({}) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (...a: unknown[]) => mockToast(...a) }), toast: jest.fn() }));
jest.mock('@/hooks/usePurchases', () => ({
    useCreatePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUpdatePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCheckDuplicateInvoice: () => ({ data: null, isFetching: false }),
    useConfirmDraft: () => ({ mutateAsync, isPending: false }),
}));
jest.mock('@/hooks/usePO', () => ({ useOpenPOs: () => ({ data: [] }) }));
jest.mock('@/lib/poApi', () => ({ poApi: {} }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
jest.mock('@/components/accounts/LedgerPicker', () => ({
    LedgerPicker: ({ value }: any) => <div data-testid="ledger">{value?.name ?? 'no ledger'}</div>,
}));
jest.mock('../AddNewProductDrawer', () => ({ AddNewProductDrawer: () => null }));

import { NewPurchaseForm } from '../NewPurchaseForm';

const renderForm = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NewPurchaseForm invoiceToEdit={{ id: 'draft-1', status: 'SAVED' } as never} onSuccess={jest.fn()} />
    </QueryClientProvider>,
);
import { useAuthStore } from '@/store/authStore';

const READY = {
    status: 'ready',
    draftId: 'draft-1',
    invoiceImageUrl: null,
    invoiceImageUrls: [],
    warnings: [],
    needsReview: false,
    header: {
        partyLedgerId: 'pl1',
        partyLedger: { id: 'pl1', name: 'BHAGIRATH DISTRIBUTORS', groupId: 'g', groupName: 'Sundry Creditors',
            nature: 'liability', openingBalance: 0, balanceType: 'Cr', currentBalance: 0, isSystem: false, createdAt: '' },
        invoiceNo: 'BDS32153',
        invoiceDate: '2026-11-13',
    },
    items: [{
        name: 'TELMA 40MG TAB', ocrOriginalName: 'TELMA 40MG TAB', batchNo: '18250440', expiry: '2028-08-01',
        qty: 4, freeQty: 0, mrp: 108.36, rate: 74.3, discount: 0, gstPct: 5, amount: 297.2, validationOk: true,
        medicineMatch: {
            matched: false, productId: null, productName: 'TELMA 40MG TAB', confidence: 0.7,
            suggestions: [{ id: 'p-telma', name: 'TELMA 40MG TAB 15TB', packSize: 15, packUnit: 'tablet', gstRate: 5, mrp: 108.36 }],
        },
    }],
    totals: {},
};

beforeEach(() => {
    mockGet.mockReset();
    mutateAsync.mockClear();
    mockToast.mockReset();
    mockGet.mockResolvedValue({ data: READY });
    useAuthStore.setState({ user: { id: 'u', role: 'admin', permissions: ['create_purchases'], outlet: { id: 'o1' } } as never, outlet: { id: 'o1' } } as never);
});

it('picking a suggested product and pressing Save saves the bill (no stale validation error)', async () => {
    renderForm();

    const chip = await screen.findByRole('button', { name: /TELMA 40MG TAB 15TB/ });
    fireEvent.click(chip);                                   // the only edit staff make

    const save = screen.getByRole('button', { name: /^Save\s*Ctrl\+Enter$/ });
    fireEvent.click(save);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const { payload } = mutateAsync.mock.calls[0][0];
    expect(payload.items[0].masterProductId).toBe('p-telma');
    expect(payload.items[0].ocrOriginalName).toBe('TELMA 40MG TAB');
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Form Validation Error' }));
});

it('a row still without a product blocks Save and names the line', async () => {
    renderForm();
    await screen.findByRole('button', { name: /TELMA 40MG TAB 15TB/ });
    fireEvent.click(screen.getByRole('button', { name: /^Save\s*Ctrl\+Enter$/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Form Validation Error',
        description: expect.stringContaining('row 1 (TELMA 40MG TAB)'),
    })));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText('Pick a product: tap a suggestion or search')).toBeInTheDocument();
});


it('a row whose values may come from another row is flagged, and "View on bill" shows that row', async () => {
    const shifted = JSON.parse(JSON.stringify(READY));
    shifted.invoiceImageUrls = ['/media/purchase_invoices/scan1.jpg'];
    shifted.pageSizes = [[2000, 1400]];
    Object.assign(shifted.items[0], {
        rowCheckOk: false,
        rowCheckNote: 'The rate, amount read for this row are not on its printed line — may be from another row.',
        rowBox: { page: 1, box: [400, 30, 430, 970] },
    });
    mockGet.mockResolvedValue({ data: shifted });
    renderForm();
    expect(await screen.findByText(/Check this row against the bill/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View on bill/ }));
    const strip = await screen.findByTestId('scan-row-strip');
    expect(strip.getAttribute('style')).toContain('scan1.jpg');
    expect(screen.getByText('Row 1 on the bill')).toBeInTheDocument();
});
