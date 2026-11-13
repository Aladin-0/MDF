import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/dashboard/purchases' }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (...a: unknown[]) => mockToast(...a) }), toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/hooks/usePO', () => ({ useOpenPOs: () => ({ data: { results: [] } }), useInvalidatePO: () => jest.fn() }));
const createPurchase = jest.fn();
const updatePurchase = jest.fn();
jest.mock('@/hooks/usePurchases', () => ({
    useCreatePurchase: () => ({ mutateAsync: createPurchase, isPending: false }),
    useUpdatePurchase: () => ({ mutateAsync: updatePurchase, isPending: false }),
    useConfirmDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCheckDuplicateInvoice: () => ({ data: null }),
}));
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => ({ data: { gstRegistered: true, landingCostIncludeGst: false, landingCostIncludeFreight: true } }) }));
jest.mock('@/components/accounts/LedgerPicker', () => ({
    LedgerPicker: ({ placeholder, onChange }: any) => <button type="button" data-testid="picker" onClick={() => onChange({ id: 'l1', name: 'ACME DISTRIBUTORS', groupName: 'Sundry Creditors', state: 'Maharashtra', currentBalance: 0 })}>{placeholder}</button>,
    formatLedgerBalance: () => '₹0.00', getBalBadgeColor: () => '',
}));
jest.mock('../AddNewProductDrawer', () => ({ AddNewProductDrawer: ({ open }: any) => (open ? <div data-testid="new-product-drawer" /> : null) }));
jest.mock('@/lib/apiClient', () => ({
    API_URL: 'http://api.test', getHeaders: () => ({}), inventoryApi: {},
    productsApi: { search: jest.fn().mockResolvedValue([{ id: 'p1', name: 'DOLO-650 TAB', composition: 'PARACETAMOL', gstRate: 5, mrp: 32.1, packSize: 15, packUnit: 'Tablet', hsnCode: '3004', totalStock: 20 }]) },
}));

import { NewPurchaseForm } from '../NewPurchaseForm';
import { MobilePurchase } from './MobilePurchase';
import { useAuthStore } from '@/store/authStore';

function phone(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: jest.fn().mockImplementation(() => ({ matches, addEventListener: jest.fn(), removeEventListener: jest.fn() })) });
}
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

async function addDolo(opts: { batch?: string; expiry?: string; qty?: string; rate?: string } = {}) {
    const { batch = 'B-77', expiry = '1228', qty = '10', rate = '22.5' } = opts;
    fireEvent.click(screen.getByTestId('add-first'));
    fireEvent.change(screen.getByTestId('purchase-search-input'), { target: { value: 'dolo' } });
    fireEvent.click((await screen.findAllByTestId('purchase-search-result'))[0]);
    await screen.findByTestId('line-batch');
    if (batch) fireEvent.change(screen.getByTestId('line-batch'), { target: { value: batch } });
    if (expiry) { fireEvent.change(screen.getByTestId('line-expiry'), { target: { value: expiry } }); fireEvent.blur(screen.getByTestId('line-expiry')); }
    if (qty) fireEvent.change(screen.getByTestId('line-qty'), { target: { value: qty } });
    if (rate) fireEvent.change(screen.getByTestId('line-rate'), { target: { value: rate } });
    fireEvent.click(screen.getByTestId('line-done'));
}
const fillHeader = () => { fireEvent.click(screen.getByTestId('picker')); fireEvent.change(screen.getByTestId('invoice-no'), { target: { value: 'INV-77' } }); };

beforeEach(() => {
    jest.clearAllMocks();
    createPurchase.mockResolvedValue({ id: 'pur1' });
    updatePurchase.mockResolvedValue({ id: 'pur1' });
    localStorage.clear();
    useAuthStore.setState({ outlet: { id: 'o1', state: 'Maharashtra' } as any, user: { id: 'u1', role: 'admin', permissions: [] } as any });
    phone(true);
});

describe('NewPurchaseForm picks the layout by screen width', () => {
    it('a phone gets the cards-and-sheets layout, not the 17-column grid', async () => {
        wrap(<NewPurchaseForm onSuccess={jest.fn()} />);
        expect(await screen.findByTestId('mobile-purchase')).toBeInTheDocument();
        expect(screen.queryByRole('table', { name: 'Purchase items' })).not.toBeInTheDocument();
    });
    it('a tablet or desktop keeps the grid', async () => {
        phone(false);
        wrap(<NewPurchaseForm onSuccess={jest.fn()} />);
        expect(await screen.findByRole('table', { name: 'Purchase items' })).toBeInTheDocument();
        expect(screen.queryByTestId('mobile-purchase')).not.toBeInTheDocument();
    });
});

describe('MobilePurchase: an empty purchase', () => {
    it('invites the first medicine; Save is off and says what is missing first (the party)', () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        expect(screen.getByTestId('add-first')).toHaveTextContent('Add the first medicine');
        expect(screen.getByTestId('save-purchase')).toBeDisabled();
        expect(screen.getByTestId('bar-reason')).toHaveTextContent('Select the party (distributor)');
        expect(screen.getByTestId('medicine-count')).toHaveTextContent('0');
    });

    it('the reason walks through what is missing, one thing at a time', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fireEvent.click(screen.getByTestId('picker'));
        expect(screen.getByTestId('bar-reason')).toHaveTextContent('Enter the invoice number');
        fireEvent.change(screen.getByTestId('invoice-no'), { target: { value: 'INV-1' } });
        expect(screen.getByTestId('bar-reason')).toHaveTextContent('Add at least one medicine');
        fireEvent.click(screen.getByTestId('bar-reason'));                      // tapping it opens the add-medicine sheet
        expect(await screen.findByText('Find the medicine')).toBeInTheDocument();
    });
});

describe('MobilePurchase: entering and saving a purchase', () => {
    it('add a medicine: the card appears, the bar shows the same net payable as the desktop would (₹236.00)', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        const card = await screen.findByTestId('purchase-line-card');
        expect(card).toHaveTextContent('DOLO-650 TAB');
        expect(card).toHaveTextContent('B: B-77');
        expect(card).toHaveTextContent('Exp: 12/2028');
        expect(screen.getByTestId('medicine-count')).toHaveTextContent('1');
        expect(screen.getByTestId('bar-net')).toHaveTextContent('₹236.00');           // 10 x 22.5 = 225 + 5% GST 11.25 = 236.25, rounded
        expect(screen.getByTestId('bar-counts')).toHaveTextContent('1 medicine · 150 units');
        expect(screen.getByTestId('save-purchase')).toBeEnabled();
        expect(screen.queryByTestId('bar-reason')).not.toBeInTheDocument();
    });

    it('Save sends the purchase to the server with the right numbers and then leaves the screen', async () => {
        const onSuccess = jest.fn();
        wrap(<MobilePurchase onSuccess={onSuccess} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('save-purchase'));
        await waitFor(() => expect(createPurchase).toHaveBeenCalledTimes(1));
        const payload = createPurchase.mock.calls[0][0];
        expect(payload).toMatchObject({ outletId: 'o1', partyLedgerId: 'l1', invoiceNo: 'INV-77', purchaseType: 'credit', grandTotal: 236, taxableAmount: 225, gstAmount: 11.25, roundOff: -0.25 });
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({ masterProductId: 'p1', batchNo: 'B-77', expiryDate: '2028-12-01', pkg: 15, qty: 10, purchaseRate: 22.5, gstRate: 5, mrp: 32.1 });
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Purchase saved ✓' }));
    });

    it('a medicine with no batch: Save is off, the reason names it, and tapping it opens that medicine', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo({ batch: '' });
        expect(screen.getByTestId('save-purchase')).toBeDisabled();
        expect(screen.getByTestId('bar-reason')).toHaveTextContent('DOLO-650 TAB: Batch number needed');
        expect(screen.getByTestId('line-issues')).toHaveTextContent('Batch number needed');
        fireEvent.click(screen.getByTestId('bar-reason'));
        expect(await screen.findByTestId('line-batch')).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('line-batch'), { target: { value: 'B1' } });
        fireEvent.click(screen.getByTestId('line-done'));
        expect(screen.getByTestId('save-purchase')).toBeEnabled();
    });

    it('tapping a card edits that medicine, and the bar follows the change', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1/ }));
        fireEvent.change(await screen.findByTestId('line-qty'), { target: { value: '20' } });
        fireEvent.click(screen.getByTestId('line-done'));
        expect(screen.getByTestId('bar-net')).toHaveTextContent('₹473.00');           // 20 x 22.5 = 450 + 5% GST 22.5 = 472.50, rounded up to 473
    });

    it('Remove inside the editor takes the medicine off the purchase', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1/ }));
        fireEvent.click(await screen.findByTestId('line-remove'));
        expect(screen.queryByTestId('purchase-line-card')).not.toBeInTheDocument();
        expect(screen.getByTestId('add-first')).toBeInTheDocument();
    });

    it('backing out of an empty Add sheet leaves nothing behind', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fireEvent.click(screen.getByTestId('add-first'));
        fireEvent.click(await screen.findByTestId('line-done'));                  // Cancel
        expect(screen.queryByTestId('purchase-line-card')).not.toBeInTheDocument();
        expect(screen.getByTestId('medicine-count')).toHaveTextContent('0');
    });

    it('freight and an invoice discount in the total sheet change the net payable', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('open-totals'));
        fireEvent.change(await screen.findByTestId('adj-freight'), { target: { value: '50' } });
        expect(screen.getByTestId('totals-net')).toHaveTextContent('₹286.00');        // 236.25 + 50 = 286.25 -> 286
        fireEvent.click(screen.getByTestId('totals-done'));
        expect(screen.getByTestId('bar-net')).toHaveTextContent('₹286.00');
    });

    it('cash purchase: the details sheet switches the type and it is sent as cash', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('open-details'));
        fireEvent.click(await screen.findByTestId('type-cash'));
        fireEvent.click(screen.getByTestId('details-done'));
        expect(screen.getByTestId('details-summary')).toHaveTextContent('Cash');
        fireEvent.click(screen.getByTestId('save-purchase'));
        await waitFor(() => expect(createPurchase).toHaveBeenCalled());
        expect(createPurchase.mock.calls[0][0].purchaseType).toBe('cash');
    });

    it('a failed save keeps everything and says why', async () => {
        createPurchase.mockRejectedValue({ error: { code: 'X', message: 'Server said no' } });
        const onSuccess = jest.fn();
        wrap(<MobilePurchase onSuccess={onSuccess} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('save-purchase'));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission Failed', description: 'Server said no' })));
        expect(onSuccess).not.toHaveBeenCalled();
        expect(screen.getByTestId('purchase-line-card')).toBeInTheDocument();
    });
});

describe('MobilePurchase: adding a product that is not in the catalogue', () => {
    it('the line sheet steps aside while the new-product drawer is open, and the row is kept for when it is done', async () => {
        // an empty search answer, so the "add as a new product" button is offered
        const { productsApi } = jest.requireMock('@/lib/apiClient');
        productsApi.search.mockResolvedValueOnce([]);
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fireEvent.click(screen.getByTestId('add-first'));
        fireEvent.change(screen.getByTestId('purchase-search-input'), { target: { value: 'newmed' } });
        fireEvent.click(await screen.findByTestId('add-new-product'));
        expect(await screen.findByTestId('new-product-drawer')).toBeInTheDocument();
        expect(screen.queryByTestId('purchase-search-input')).not.toBeInTheDocument();       // not hidden behind the drawer: simply not on screen
    });
});

describe('MobilePurchase: PKG (units per pack)', () => {
    const sendPayload = () => createPurchase.mock.calls[0][0];

    it('a line whose PKG is blank cannot be saved: the bar says why and tapping it opens the line', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1/ }));
        fireEvent.change(await screen.findByTestId('line-pkg'), { target: { value: '' } });
        fireEvent.click(screen.getByTestId('line-done'));
        expect(screen.getByTestId('save-purchase')).toBeDisabled();
        expect(screen.getByTestId('bar-reason')).toHaveTextContent('DOLO-650 TAB: Pkg (units per pack) needed');
        fireEvent.click(screen.getByTestId('bar-reason'));
        expect(await screen.findByTestId('line-pkg')).toBeInTheDocument();
        expect(createPurchase).not.toHaveBeenCalled();
    });

    it('a PKG that contradicts the catalogue (15) is asked about before saving, then saved as entered with the units worked from it', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();                                            // the product is 15 per pack: PKG 15
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1/ }));
        fireEvent.change(await screen.findByTestId('line-pkg'), { target: { value: '12' } });
        expect(screen.getByText('Tablet · Catalogue: 15')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('line-done'));
        fireEvent.click(screen.getByTestId('save-purchase'));
        const list = await screen.findByTestId('pack-confirm-list');
        expect(list).toHaveTextContent('DOLO-650 TAB');
        expect(list).toHaveTextContent('Pkg 12 (catalogue 15) · 10 packs = 120 units added');
        expect(createPurchase).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('pack-confirm-save'));
        await waitFor(() => expect(createPurchase).toHaveBeenCalledTimes(1));
        expect(sendPayload().items[0]).toMatchObject({ pkg: 12, qty: 10, actualQty: 120 });
    });

    it('"Go back and check" opens that line instead of saving', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1/ }));
        fireEvent.change(await screen.findByTestId('line-pkg'), { target: { value: '12' } });
        fireEvent.click(screen.getByTestId('line-done'));
        fireEvent.click(screen.getByTestId('save-purchase'));
        fireEvent.click(await screen.findByTestId('pack-review'));
        expect(await screen.findByTestId('line-pkg')).toHaveValue('12');
        expect(createPurchase).not.toHaveBeenCalled();
    });

    it('the PKG the product has saves without a question', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('save-purchase'));
        await waitFor(() => expect(createPurchase).toHaveBeenCalledTimes(1));
        expect(screen.queryByTestId('pack-confirm')).not.toBeInTheDocument();
        expect(sendPayload().items[0]).toMatchObject({ pkg: 15, actualQty: 150 });
    });

    it('when the server refuses the line\'s pack size, that line opens with the reason under PKG', async () => {
        createPurchase.mockRejectedValue({ error: { code: 'PACK_SIZE_CONFLICT', itemIndex: 0, message: 'Item 1 (DOLO-650 TAB): batch B-77 is already in stock as packs of 10, but this line says PKG 15.' } });
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('save-purchase'));
        expect(await screen.findByText(/already in stock as packs of 10/)).toBeInTheDocument();
        expect(screen.getByTestId('line-pkg')).toHaveAttribute('aria-invalid', 'true');
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Pack size conflicts with stock' }));
    });
});

describe('MobilePurchase: drafts', () => {
    it('Save draft stores the purchase under the same key as the desktop form (so a draft moves between them)', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByTestId('save-draft'));
        const raw = localStorage.getItem('purchase_form_draft_o1_u1');
        expect(raw).toBeTruthy();
        const saved = JSON.parse(raw!);
        expect(saved.formValues.invoiceNo).toBe('INV-77');
        expect(saved.savedItems[0].batchNo).toBe('B-77');
        expect(mockToast).toHaveBeenCalledWith({ title: 'Draft saved' });
    });

    it('an earlier draft is offered on opening and Restore brings the medicines back', async () => {
        localStorage.setItem('purchase_form_draft_o1_u1', JSON.stringify({
            formValues: { partyLedgerId: 'l1', invoiceNo: 'OLD-1', invoiceDate: '2026-11-01', purchaseType: 'credit', godown: 'main', freight: 0, invoiceDiscount: 0, items: [] },
            savedItems: [{ productId: 'p1', productName: 'LOSAR 50', batchNo: 'X1', expiryDate: '2027-01-01', pkg: 10, qty: 4, freeQty: 0, purchaseRate: 50, mrp: 80, gstRate: 12, discountPct: 0, cashDiscountPct: 0, cess: 0, ptr: 0, pts: 0, saleRate: 0, hsnCode: '', isCustom: false }],
        }));
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fireEvent.click(await screen.findByTestId('draft-restore'));
        expect(await screen.findByText('LOSAR 50')).toBeInTheDocument();
        expect(screen.getByTestId('invoice-no')).toHaveValue('OLD-1');
        expect(screen.queryByTestId('draft-banner')).not.toBeInTheDocument();
    });
});

describe('MobilePurchase: changing a saved purchase', () => {
    const saved: any = {
        id: 'inv1', status: 'CONFIRMED', invoiceNo: 'INV-5', invoiceDate: '2026-11-01T00:00:00Z', purchaseType: 'credit', partyLedgerId: 'l1', partyLedger: { id: 'l1', name: 'ACME DISTRIBUTORS', state: 'Maharashtra' },
        godown: 'main', freight: 0, notes: '', ledgerAdjustment: 0, dueDate: '2026-12-01',
        items: [{ masterProductId: 'p1', product: { name: 'DOLO-650 TAB' }, isCustomProduct: false, hsnCode: '3004', batchNo: 'B9', expiryDate: '2028-12-01', pkg: 15, qty: 10, freeQty: 0, purchaseRate: 22.5, discountPct: 0, cashDiscountPct: 0, gstRate: 5, cess: 0, mrp: 32.1, ptr: 0, pts: 0, saleRate: 0 }],
    };

    it('opens with the saved medicines, and the button says Update purchase', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} invoiceToEdit={saved} />);
        expect(await screen.findByText('DOLO-650 TAB')).toBeInTheDocument();
        expect(screen.getByTestId('save-purchase')).toHaveTextContent('Update purchase');
        expect(screen.queryByTestId('save-draft')).not.toBeInTheDocument();
    });

    it('Update asks for the reason first; the reason travels with the change', async () => {
        const onSuccess = jest.fn();
        wrap(<MobilePurchase onSuccess={onSuccess} invoiceToEdit={saved} />);
        await screen.findByText('DOLO-650 TAB');
        fireEvent.click(screen.getByTestId('save-purchase'));
        expect(updatePurchase).not.toHaveBeenCalled();
        expect(await screen.findByText('Reason for the change')).toBeInTheDocument();
        expect(screen.getByTestId('revision-confirm')).toBeDisabled();
        fireEvent.change(screen.getByTestId('revision-code'), { target: { value: 'RATE_CORRECTION' } });
        fireEvent.change(screen.getByTestId('revision-text'), { target: { value: 'Rate was keyed wrong on the bill' } });
        fireEvent.click(screen.getByTestId('revision-confirm'));
        await waitFor(() => expect(updatePurchase).toHaveBeenCalledTimes(1));
        const { id, payload } = updatePurchase.mock.calls[0][0];
        expect(id).toBe('inv1');
        expect(JSON.stringify(payload)).toContain('RATE_CORRECTION');
        expect(JSON.stringify(payload)).toContain('Rate was keyed wrong on the bill');
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('inv1'));
    });

    it('closing the reason sheet saves nothing', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} invoiceToEdit={saved} />);
        await screen.findByText('DOLO-650 TAB');
        fireEvent.click(screen.getByTestId('save-purchase'));
        fireEvent.click(await screen.findByText('Cancel'));
        expect(updatePurchase).not.toHaveBeenCalled();
    });
});

describe('MobilePurchase: removing a medicine can be undone', () => {
    it('Remove in the editor offers Undo on a toast, and Undo puts the medicine back where it was', async () => {
        const { act } = jest.requireActual('@testing-library/react');
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fillHeader();
        await addDolo();
        fireEvent.click(screen.getByRole('button', { name: /Edit medicine 1/ }));
        fireEvent.click(await screen.findByTestId('line-remove'));
        expect(screen.queryByTestId('purchase-line-card')).not.toBeInTheDocument();
        const call = mockToast.mock.calls.map((c) => c[0]).find((a) => a?.title === 'Medicine removed');
        expect(call).toBeTruthy();
        expect(call.description).toBe('DOLO-650 TAB');
        act(() => { call.action.props.onClick(); });
        expect(await screen.findByTestId('purchase-line-card')).toHaveTextContent('B: B-77');
        expect(screen.getByTestId('bar-net')).toHaveTextContent('₹236.00');
    });

    it('backing out of an empty row offers no Undo (there was nothing to lose)', async () => {
        wrap(<MobilePurchase onSuccess={jest.fn()} />);
        fireEvent.click(screen.getByTestId('add-first'));
        fireEvent.click(await screen.findByTestId('line-done'));
        expect(mockToast.mock.calls.map((c) => c[0]?.title)).not.toContain('Medicine removed');
    });
});

describe('MobilePurchase: leaving', () => {
    it('with typed-in work, Cancel asks first; Keep editing stays; Save draft & leave keeps it; Discard drops it', async () => {
        const onSuccess = jest.fn();
        wrap(<MobilePurchase onSuccess={onSuccess} />);
        fillHeader();
        fireEvent.click(screen.getByTestId('cancel-purchase'));
        expect(await screen.findByTestId('leave-dialog')).toHaveTextContent('Leave this purchase?');
        expect(onSuccess).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('leave-keep'));
        expect(onSuccess).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('cancel-purchase'));
        fireEvent.click(await screen.findByTestId('leave-save-draft'));
        expect(JSON.parse(localStorage.getItem('purchase_form_draft_o1_u1')!).formValues.invoiceNo).toBe('INV-77');
        expect(onSuccess).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('cancel-purchase'));
        fireEvent.click(await screen.findByTestId('leave-discard'));
        expect(localStorage.getItem('purchase_form_draft_o1_u1')).toBeNull();
        expect(onSuccess).toHaveBeenCalledTimes(2);
    });


    it('Cancel goes back without saving', () => {
        const onSuccess = jest.fn();
        wrap(<MobilePurchase onSuccess={onSuccess} />);
        fireEvent.click(screen.getByTestId('cancel-purchase'));
        expect(onSuccess).toHaveBeenCalledWith();
        expect(createPurchase).not.toHaveBeenCalled();
    });
});
