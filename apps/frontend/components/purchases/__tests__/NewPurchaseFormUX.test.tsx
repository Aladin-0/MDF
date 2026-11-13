import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/dashboard/purchases' }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'o1' }));
const mockToast = jest.fn();
const mockCreatePurchase = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: (...a: unknown[]) => mockToast(...a) }), toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/hooks/usePO', () => ({ useOpenPOs: () => ({ data: { results: [] } }), useInvalidatePO: () => jest.fn() }));
jest.mock('@/hooks/usePurchases', () => ({
    useCreatePurchase: () => ({ mutateAsync: mockCreatePurchase, isPending: false }),
    useUpdatePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useConfirmDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCheckDuplicateInvoice: () => ({ data: null }),
}));
jest.mock('@/hooks/useProductSearch', () => ({ useProductSearch: () => ({ data: [], isFetching: false }) }));
jest.mock('@/components/accounts/LedgerPicker', () => ({ LedgerPicker: ({ placeholder, onChange }: any) => <input aria-label="Party" placeholder={placeholder} onChange={() => onChange({ id: 'l1', name: 'ACME', state: 'Maharashtra' })} /> }));
jest.mock('@/components/purchases/AddNewProductDrawer', () => ({ AddNewProductDrawer: () => null }));
jest.mock('@/lib/apiClient', () => ({ API_URL: 'http://api.test', getHeaders: () => ({}), productsApi: { search: jest.fn().mockResolvedValue([]) }, inventoryApi: {} }));

import { NewPurchaseForm } from '../NewPurchaseForm';
import { formatStockQty } from '../PurchaseItemRow';

const renderForm = () => render(<QueryClientProvider client={new QueryClient()}><NewPurchaseForm onSuccess={jest.fn()} /></QueryClientProvider>);
const save = () => screen.getByTitle('Shortcut: Ctrl + Enter');

beforeEach(() => { mockToast.mockReset(); mockCreatePurchase.mockReset(); mockCreatePurchase.mockResolvedValue({ id: 'p1' }); });

describe('formatStockQty (the product list showed 11.866666666666667)', () => {
    it('keeps whole numbers whole', () => expect(formatStockQty(2690)).toBe('2,690'));
    it('cuts a fraction to one decimal', () => expect(formatStockQty(11.866666666666667)).toBe('11.9'));
    it('copes with strings, null and junk', () => {
        expect(formatStockQty('3')).toBe('3');
        expect(formatStockQty(null)).toBe('0');
        expect(formatStockQty('abc')).toBe('0');
    });
});

describe('New Purchase form: look and feel', () => {
    it('Save uses the theme colour (primary), not a hard-coded violet', () => {
        renderForm();
        expect(save().className).toContain('bg-primary');
        expect(document.body.innerHTML).not.toMatch(/violet/);
    });

    it('the Amount column stays in view when the table scrolls sideways (sticky, next to the action columns)', () => {
        renderForm();
        const th = screen.getByRole('columnheader', { name: 'Amount' });
        expect(th.className).toContain('sm:sticky');
        expect(th.className).toContain('sm:right-[60px]');
        const cell = document.querySelector('tbody td.sm\\:right-\\[60px\\]');
        expect(cell).not.toBeNull();
        expect(cell!.className).not.toMatch(/bg-slate-100\/70/);       // sticky cells must be opaque or the columns underneath show through
    });

    it('both header rows use stacked labels of the same size, readable next to the inputs', () => {
        renderForm();
        for (const name of ['Party', 'Invoice No', 'Godown', 'Credit Days', 'PO Ref', 'Notes']) {
            const label = screen.getByText(name, { selector: 'label' });
            expect(label.className).toContain('text-xs');
            expect(label.className).not.toContain('text-[11px]');
            expect(label.className).not.toContain('shrink-0');          // not the old inline-beside-the-field label
        }
    });

    it('an empty form tells the clerk what to do', () => {
        renderForm();
        expect(screen.getByTestId('grid-empty-hint')).toHaveTextContent(/Start typing a medicine name/);
    });
});

describe('New Purchase form: Save on an empty form', () => {
    it('shows the problems on the form itself (no medicine, party, invoice no), not only in a toast that hides Save', async () => {
        renderForm();
        fireEvent.click(save());
        expect(await screen.findByText(/Add at least one medicine: type a name in the Product column/)).toBeInTheDocument();
        expect(await screen.findByText('Select the party (distributor)')).toBeInTheDocument();
        expect(await screen.findByText('Enter the invoice number')).toBeInTheDocument();
        expect(mockToast).not.toHaveBeenCalled();          // the form says it itself; a toast would only cover the Save button
    });

    it('puts the cursor on the first missing thing (the party)', async () => {
        renderForm();
        fireEvent.click(save());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Party')));
    });
});

describe('New Purchase form: errors clear when fixed', () => {
    it('the Invoice No error goes away as soon as a number is typed', async () => {
        renderForm();
        fireEvent.click(save());
        expect(await screen.findByText('Enter the invoice number')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('e.g. AJD-2026-0123'), { target: { value: 'INV-77' } });
        await waitFor(() => expect(screen.queryByText('Enter the invoice number')).not.toBeInTheDocument());
    });
});

describe('Pinned columns must be opaque', () => {
    it('no row uses a see-through background (the pinned #, Product, Amount, expand and remove cells would show scrolled columns through it)', async () => {
        renderForm();
        fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
        const rows = document.querySelectorAll('tbody tr[data-cart-row]');
        expect(rows.length).toBe(2);
        rows.forEach((r) => expect(r.className + r.querySelector('td')!.className).not.toMatch(/bg-slate-50\/\d+/));
    });
});

describe('Many rows: the page scrolls, the table does not', () => {
    const wrapper = () => screen.getByRole('table', { name: 'Purchase items' }).parentElement!;

    it('the table has no scroll box of its own (no max-height, no vertical scrolling), so every row is visible', () => {
        renderForm();
        const cls = wrapper().className;
        expect(cls).not.toMatch(/max-h-/);
        expect(cls).not.toMatch(/overflow-auto|overflow-y/);
    });

    it('nothing scrolls sideways on a wide screen (overflow-x-clip from 1380px), only on a tablet (overflow-x-auto)', () => {
        renderForm();
        expect(wrapper().className).toContain('overflow-x-auto');
        expect(wrapper().className).toContain('min-[1380px]:overflow-x-clip');
    });

    it('the column header pins below the app\'s top bar (--app-header-h), not behind it', () => {
        renderForm();
        const thead = screen.getByRole('table', { name: 'Purchase items' }).querySelector('thead')!;
        expect(thead.className).toContain('sticky');
        expect(thead.className).toContain('top-[var(--app-header-h,0px)]');
    });

    it('a button under the last row adds another medicine, so you do not scroll back up to Add Item', () => {
        renderForm();
        expect(document.querySelectorAll('tbody tr[data-cart-row]').length).toBe(1);
        fireEvent.click(screen.getByTestId('add-row-bottom'));
        fireEvent.click(screen.getByTestId('add-row-bottom'));
        expect(document.querySelectorAll('tbody tr[data-cart-row]').length).toBe(3);
    });
});

// ─── the review pass: keyboard flow, names, wording, leaving ─────────────────────────────────────────────────────────────────────────────

import { useAuthStore } from '@/store/authStore';

const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const draftItem = (extra: any = {}) => ({ productId: 'p1', productName: 'DOLO 650', isCustom: false, hsnCode: '3004', batchNo: 'B1', expiryDate: iso(400), pkg: 15, packUnitLabel: 'Tablet', qty: 2, freeQty: 0, purchaseRate: 20, freightPerUnit: 0, otherCostPerUnit: 0, discountPct: 0, cashDiscountPct: 0, gstRate: 5, cess: 0, mrp: 32, ptr: 0, pts: 0, saleRate: 0, ...extra });
const restoreWith = async (items: any[]) => {
    // like a real saved draft: the items are in the form values as well as in the list
    localStorage.setItem('purchase_form_draft_o1_u1', JSON.stringify({ formValues: { partyLedgerId: 'l1', invoiceNo: 'D-1', invoiceDate: '2026-11-01', purchaseType: 'credit', godown: 'main', freight: 0, invoiceDiscount: 0, items }, savedItems: items }));
    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await screen.findByLabelText('Batch, medicine 1');
};

describe('New Purchase grid: keyboard flow', () => {
    beforeEach(() => { localStorage.clear(); useAuthStore.setState({ outlet: { id: 'o1', state: 'Maharashtra' } as any, user: { id: 'u1', role: 'admin', permissions: [] } as any }); });

    it('choosing a party moves the cursor to the Invoice No box (the picker\'s own box disappears, which used to drop focus to the page)', async () => {
        renderForm();
        fireEvent.change(screen.getByLabelText('Party'), { target: { value: 'ac' } });
        await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('e.g. AJD-2026-0123')));
    });

    it('a refused save puts the cursor on the first thing that is wrong: the batch cell of the first bad row', async () => {
        await restoreWith([draftItem(), draftItem({ productName: 'LOSAR', batchNo: '' })]);
        fireEvent.click(screen.getByTitle('Shortcut: Ctrl + Enter'));
        await waitFor(() => expect((document.activeElement as HTMLElement)?.getAttribute('data-field')).toBe('batch'));
        expect(document.activeElement).toHaveAttribute('aria-label', 'Batch, medicine 2');
        expect(document.activeElement).toHaveAttribute('aria-invalid', 'true');
        expect(document.activeElement).toHaveAttribute('title', 'Enter the batch number');
    });
});

describe('New Purchase grid: every cell has a name', () => {
    beforeEach(() => { localStorage.clear(); useAuthStore.setState({ outlet: { id: 'o1', state: 'Maharashtra' } as any, user: { id: 'u1', role: 'admin', permissions: [] } as any }); });

    it('each box in a row says what it is and which medicine (the column header alone is not announced for an input)', async () => {
        await restoreWith([draftItem(), draftItem({ productName: 'LOSAR' })]);
        for (const name of ['HSN', 'Batch', 'Expiry (MM/YYYY)', 'Pkg (units per pack)', 'Qty (packs)', 'Free (packs)', 'MRP', 'Rate (purchase rate)', 'GST%', 'PTR', 'PTS', 'Disc% (discount)']) {
            expect(screen.getByLabelText(`${name}, medicine 1`)).toBeInTheDocument();
            expect(screen.getByLabelText(`${name}, medicine 2`)).toBeInTheDocument();
        }
    });

    it('no input in the table is nameless, and none of them offers autofill; the codes have no spell-check squiggle', async () => {
        await restoreWith([draftItem()]);
        const inputs = Array.from(document.querySelectorAll('table[aria-label="Purchase items"] input')) as HTMLInputElement[];
        expect(inputs.length).toBeGreaterThan(10);
        for (const i of inputs) { expect(i.getAttribute('aria-label')).toBeTruthy(); expect(i.getAttribute('autocomplete')).toBe('off'); }
        for (const f of ['batch', 'hsn', 'expiry']) expect(document.querySelector(`[data-field="${f}"]`)).toHaveAttribute('spellcheck', 'false');
    });

    it('the adjustments boxes have labels you can click', () => {
        renderForm();
        expect(screen.getByLabelText(/Freight \/ Transport/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Invoice Discount/)).toBeInTheDocument();
    });
});

describe('New Purchase grid: expiry in words', () => {
    beforeEach(() => { localStorage.clear(); useAuthStore.setState({ outlet: { id: 'o1', state: 'Maharashtra' } as any, user: { id: 'u1', role: 'admin', permissions: [] } as any }); });

    it('an expired batch says Expired under the box, not only a pink cell and a hover tip', async () => {
        await restoreWith([draftItem({ expiryDate: iso(-20) })]);
        expect(screen.getByTestId('expiry-note')).toHaveTextContent('Expired');
        expect(screen.getByLabelText('Expiry (MM/YYYY), medicine 1')).toHaveAttribute('aria-describedby', 'expiry-note-0');
    });

    it('a batch under 90 days says so', async () => {
        await restoreWith([draftItem({ expiryDate: iso(30) })]);
        expect(screen.getByTestId('expiry-note')).toHaveTextContent('Under 90 days');
    });

    it('a healthy batch shows nothing extra', async () => {
        await restoreWith([draftItem()]);
        expect(screen.queryByTestId('expiry-note')).not.toBeInTheDocument();
    });

    it('the "expiring within 90 days" notice is a chip in the Medicines bar (a banner above the form pushed the whole table down mid-typing)', async () => {
        await restoreWith([draftItem({ expiryDate: iso(30) }), draftItem({ expiryDate: iso(50), productName: 'B' })]);
        const chip = screen.getByTestId('near-expiry-chip');
        expect(chip).toHaveTextContent('2 expired or under 90 days');
        expect(chip.closest('section')).toHaveAttribute('aria-label', 'Medicine entry');
        expect(document.querySelector('form > div.border-orange-200')).toBeNull();
    });
});

describe('New Purchase grid: leaving with typed-in work', () => {
    const onSuccess = jest.fn();
    const mount = () => render(<QueryClientProvider client={new QueryClient()}><NewPurchaseForm onSuccess={onSuccess} /></QueryClientProvider>);
    beforeEach(() => { onSuccess.mockReset(); localStorage.clear(); useAuthStore.setState({ outlet: { id: 'o1', state: 'Maharashtra' } as any, user: { id: 'u1', role: 'admin', permissions: [] } as any }); });

    it('nothing typed: Cancel just leaves', () => {
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('leave-dialog')).not.toBeInTheDocument();
    });

    it('something typed: Cancel asks first, and Keep editing stays', async () => {
        mount();
        fireEvent.change(screen.getByPlaceholderText('e.g. AJD-2026-0123'), { target: { value: 'INV-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByTestId('leave-dialog')).toHaveTextContent('Leave this purchase?');
        expect(onSuccess).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('leave-keep'));
        expect(onSuccess).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('e.g. AJD-2026-0123')).toHaveValue('INV-1');
    });

    it('Save draft & leave keeps the work for later', async () => {
        mount();
        fireEvent.change(screen.getByPlaceholderText('e.g. AJD-2026-0123'), { target: { value: 'INV-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(await screen.findByTestId('leave-save-draft'));
        expect(JSON.parse(localStorage.getItem('purchase_form_draft_o1_u1')!).formValues.invoiceNo).toBe('INV-1');
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('Discard leaves and removes any draft, so it is not offered back next time', async () => {
        localStorage.setItem('purchase_form_draft_o1_u1', JSON.stringify({ formValues: {}, savedItems: [] }));
        mount();
        fireEvent.change(screen.getByPlaceholderText('e.g. AJD-2026-0123'), { target: { value: 'INV-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(await screen.findByTestId('leave-discard'));
        expect(localStorage.getItem('purchase_form_draft_o1_u1')).toBeNull();
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });
});

// ─── PKG (units per pack) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('New Purchase grid: PKG', () => {
    beforeEach(() => { localStorage.clear(); useAuthStore.setState({ outlet: { id: 'o1', state: 'Maharashtra' } as any, user: { id: 'u1', role: 'admin', permissions: [] } as any }); });
    const pkgBox = (n = 1) => screen.getByLabelText(`Pkg (units per pack), medicine ${n}`) as HTMLInputElement;
    const save = () => fireEvent.click(screen.getByTitle('Shortcut: Ctrl + Enter'));

    it('takes whole numbers only: a decimal, a minus sign, letters or a pasted "1,5" are cut at the first non-digit', async () => {
        await restoreWith([draftItem({ pkg: '' as any })]);
        for (const [typed, shown] of [['15.5', '15'], ['-5', ''], ['abc', ''], ['1,5', '1'], ['12345', '1234']] as const) {
            fireEvent.change(pkgBox(), { target: { value: typed } });
            expect(pkgBox().value).toBe(shown);
        }
        expect(pkgBox()).toHaveAttribute('inputmode', 'numeric');
    });

    it('a blank PKG stays blank: it does not turn into 1', async () => {
        await restoreWith([draftItem({ pkg: 15 })]);
        fireEvent.change(pkgBox(), { target: { value: '' } });
        expect(pkgBox().value).toBe('');
        expect(screen.queryByText('= 2u')).not.toBeInTheDocument();
    });

    it('saving with a blank PKG is refused, the box says what to enter, and the cursor goes to it', async () => {
        await restoreWith([draftItem({ pkg: '' as any })]);
        save();
        expect(await screen.findByTestId('pkg-error')).toHaveTextContent('Enter units per pack (Pkg)');
        await waitFor(() => expect(document.activeElement).toBe(pkgBox()));
        expect(pkgBox()).toHaveAttribute('aria-invalid', 'true');
        expect(mockCreatePurchase).not.toHaveBeenCalled();
    });

    it('says "Catalogue: 10" under a PKG that differs from a real catalogue pack size', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 10 })]);
        expect(screen.getByTestId('pkg-note')).toHaveTextContent('Catalogue: 10');
        expect(pkgBox()).toHaveAttribute('aria-describedby', 'pkg-note-0');
    });

    it('says nothing when the catalogue has no pack size (1): entering the real one is the normal case', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 1 })]);
        expect(screen.getByTestId('pkg-note')).toHaveTextContent('Tablet');             // the unit label, not a warning
        expect(screen.queryByText(/Catalogue:/)).not.toBeInTheDocument();
    });

    it('warns about a very large pack', async () => {
        await restoreWith([draftItem({ pkg: 500 })]);
        expect(screen.getByTestId('pkg-note')).toHaveTextContent('Very large pack: check');
    });

    it('a PKG that contradicts the catalogue is asked about before saving, with the units it adds', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 10, qty: 10, freeQty: 2 })]);
        save();
        const dialog = await screen.findByTestId('pack-confirm');
        expect(dialog).toHaveTextContent('Check the pack sizes');
        expect(screen.getByTestId('pack-confirm-list')).toHaveTextContent('DOLO 650');
        expect(screen.getByTestId('pack-confirm-list')).toHaveTextContent('Pkg 15 (catalogue 10) · 12 packs = 180 units added');
        expect(mockCreatePurchase).not.toHaveBeenCalled();
    });

    it('"Go back and check" puts the cursor on that PKG and saves nothing', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 10 })]);
        save();
        fireEvent.click(await screen.findByTestId('pack-review'));
        await waitFor(() => expect(document.activeElement).toBe(pkgBox()));
        expect(mockCreatePurchase).not.toHaveBeenCalled();
        expect(screen.queryByTestId('pack-confirm')).not.toBeInTheDocument();
    });

    it('"Save as entered" saves with the PKG as typed and the units worked from it', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 10, qty: 10, freeQty: 2 })]);
        save();
        fireEvent.click(await screen.findByTestId('pack-confirm-save'));
        await waitFor(() => expect(mockCreatePurchase).toHaveBeenCalledTimes(1));
        expect(mockCreatePurchase.mock.calls[0][0].items[0]).toMatchObject({ pkg: 15, qty: 10, freeQty: 2, actualQty: 180 });
    });

    it('a changed PKG is asked about again', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 10 })]);
        save();
        fireEvent.click(await screen.findByTestId('pack-review'));
        fireEvent.change(pkgBox(), { target: { value: '12' } });
        save();
        expect(await screen.findByTestId('pack-confirm-list')).toHaveTextContent('Pkg 12 (catalogue 10)');
    });

    it('a PKG that matches the catalogue saves with no question', async () => {
        await restoreWith([draftItem({ pkg: 10, catalogPkg: 10 })]);
        save();
        // (jsdom also fires the form's own submit for a click on a submit button; a real browser sends one request: checked)
        await waitFor(() => expect(mockCreatePurchase).toHaveBeenCalled());
        expect(screen.queryByTestId('pack-confirm')).not.toBeInTheDocument();
    });

    it('a catalogue size of 1 saves with no question either', async () => {
        await restoreWith([draftItem({ pkg: 15, catalogPkg: 1 })]);
        save();
        // (jsdom also fires the form's own submit for a click on a submit button; a real browser sends one request: checked)
        await waitFor(() => expect(mockCreatePurchase).toHaveBeenCalled());
        expect(screen.queryByTestId('pack-confirm')).not.toBeInTheDocument();
    });

    it('when the server refuses a line\'s pack size, that line\'s PKG shows why and gets the cursor', async () => {
        mockCreatePurchase.mockRejectedValue({ error: { code: 'PACK_SIZE_CONFLICT', itemIndex: 1, message: 'Item 2 (LOSAR): batch B1 is already in stock as packs of 10, but this line says PKG 15.' } });
        await restoreWith([draftItem({ catalogPkg: 15 }), draftItem({ productName: 'LOSAR', batchNo: 'B1', pkg: 15, catalogPkg: 15 })]);
        save();
        expect(await screen.findByTestId('pkg-error')).toHaveTextContent('already in stock as packs of 10');
        await waitFor(() => expect(document.activeElement).toBe(pkgBox(2)));
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Pack size conflicts with stock' }));
        expect(screen.getByLabelText('Pkg (units per pack), medicine 1')).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('editing the refused PKG clears the message', async () => {
        mockCreatePurchase.mockRejectedValue({ error: { code: 'INVALID_PKG', itemIndex: 0, message: 'Item 1 (DOLO 650): PKG (units per pack) must be a whole number.' } });
        await restoreWith([draftItem({ catalogPkg: 15 })]);
        save();
        expect(await screen.findByTestId('pkg-error')).toBeInTheDocument();
        fireEvent.change(pkgBox(), { target: { value: '12' } });
        await waitFor(() => expect(screen.queryByTestId('pkg-error')).not.toBeInTheDocument());
    });
});

