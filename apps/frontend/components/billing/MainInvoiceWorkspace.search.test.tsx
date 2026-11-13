import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MainInvoiceWorkspace } from './MainInvoiceWorkspace';
import { useBillingStore } from '../../store/billingStore';
import { useProductSearch } from '@/hooks/useProductSearch';
import { productsApi } from '@/lib/apiClient';

jest.mock('../../store/billingStore', () => ({ useBillingStore: jest.fn() }));
jest.mock('@/hooks/useProductSearch', () => ({ useProductSearch: jest.fn() }));
jest.mock('@/hooks/useOutletSettings', () => ({ useOutletSettings: () => ({ data: undefined }) }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, productsApi: { ...actual.productsApi, search: jest.fn(), substitutes: jest.fn() } };
});

const batch = (id: string) => ({
    id, batchNo: `B-${id}`, expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip',
});
const product = (id: string, name: string, extra: any = {}) => ({
    id, name, composition: 'LOSARTAN POTASSIUM', manufacturer: 'Mfg', gstRate: 12, packSize: 10, packUnit: 'tablet', packType: 'strip',
    scheduleType: 'OTC', mrp: 100, totalStock: 10, isLowStock: false, hasStock: true, batches: [batch(id)], ...extra,
});

const original = product('p1', 'LOSAR 50MG TAB');
const sub = product('p2', 'LOSANORM 50MG TAB', { substitute: { sameStrength: true, sameForm: true } });
const subOther = product('p3', 'LOSAR 25MG TAB', { substitute: { sameStrength: false, sameForm: null }, totalStock: 0, hasStock: false });

function setup(results: any[] = [original]) {
    (useBillingStore as unknown as jest.Mock).mockReturnValue({
        activeDraftId: 'draft-1',
        drafts: { 'draft-1': { cart: [], documentMode: 'invoice', saleType: 'RETAIL' } },
        addToCart: jest.fn(),
    });
    (useProductSearch as jest.Mock).mockReturnValue({ data: results, isFetching: false });
    render(<MainInvoiceWorkspace />);
    const box = screen.getByPlaceholderText('Search Medicine...') as HTMLInputElement;
    return box;
}

function typeInto(box: HTMLInputElement, text: string) {
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: text } });
}

beforeAll(() => {
    // jsdom has no scrollIntoView (the search box scrolls itself into view on focus) and no matchMedia (adding a product asks whether the pointer is a mouse)
    Element.prototype.scrollIntoView = jest.fn();
    Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockReturnValue({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }) });
});

beforeEach(() => {
    jest.clearAllMocks();
    (productsApi.substitutes as jest.Mock).mockResolvedValue({ products: [sub, subOther] });
});

describe('medicine search: substitutes (press A on a highlighted medicine)', () => {
    it('A after moving the highlight lists other brands with the same salt, says how each differs, and Esc goes back', async () => {
        const box = setup([original, product('p9', 'LOSARTAN OTHER')]);
        typeInto(box, 'losar');
        expect(await screen.findByText('LOSAR 50MG TAB')).toBeInTheDocument();

        fireEvent.keyDown(box, { key: 'ArrowDown', code: 'ArrowDown' });
        fireEvent.keyDown(box, { key: 'ArrowUp', code: 'ArrowUp' });
        fireEvent.keyDown(box, { key: 'a', code: 'KeyA' });

        expect(await screen.findByText(/Substitutes for/)).toHaveTextContent('LOSAR 50MG TAB');
        expect(productsApi.substitutes).toHaveBeenCalledWith('p1', expect.anything(), 'billing');
        expect(await screen.findByText('LOSANORM 50MG TAB')).toBeInTheDocument();
        expect(screen.getByText('Same strength')).toBeInTheDocument();
        expect(screen.getByText('Different strength')).toBeInTheDocument();
        expect(screen.queryByText('LOSARTAN OTHER')).not.toBeInTheDocument();       // the normal results are replaced

        fireEvent.keyDown(box, { key: 'Escape', code: 'Escape' });
        await waitFor(() => expect(screen.queryByText(/Substitutes for/)).not.toBeInTheDocument());
        expect(screen.getByText('LOSARTAN OTHER')).toBeInTheDocument();             // back to the search results
    });

    it('a plain A before any arrow key is just a letter being typed (no substitutes)', () => {
        const box = setup();
        typeInto(box, 'dolo');
        const notPrevented = fireEvent.keyDown(box, { key: 'a', code: 'KeyA' });
        expect(notPrevented).toBe(true);                                             // the browser still types it
        expect(productsApi.substitutes).not.toHaveBeenCalled();
    });

    it('typing again after arrow keys makes A a letter again', () => {
        const box = setup();
        typeInto(box, 'dolo');
        fireEvent.keyDown(box, { key: 'ArrowDown', code: 'ArrowDown' });
        typeInto(box, 'dolo6');
        const notPrevented = fireEvent.keyDown(box, { key: 'a', code: 'KeyA' });
        expect(notPrevented).toBe(true);
        expect(productsApi.substitutes).not.toHaveBeenCalled();
    });

    it('Alt+A always opens the substitutes of the highlighted medicine', async () => {
        const box = setup();
        typeInto(box, 'losar');
        await screen.findByText('LOSAR 50MG TAB');
        fireEvent.keyDown(box, { key: 'å', code: 'KeyA', altKey: true });
        expect(await screen.findByText(/Substitutes for/)).toBeInTheDocument();
    });

    it('the Substitutes button on a row does the same for mouse and touch users', async () => {
        const box = setup();
        typeInto(box, 'losar');
        fireEvent.click(await screen.findByTestId('show-substitutes'));
        expect(await screen.findByText('LOSANORM 50MG TAB')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('close-substitutes'));
        await waitFor(() => expect(screen.queryByText(/Substitutes for/)).not.toBeInTheDocument());
    });

    it('says so when a product has no salt recorded', async () => {
        (productsApi.substitutes as jest.Mock).mockResolvedValue({ products: [], reason: 'no_composition' });
        const box = setup();
        typeInto(box, 'losar');
        fireEvent.click(await screen.findByTestId('show-substitutes'));
        expect(await screen.findByText(/No salt is recorded for LOSAR 50MG TAB/)).toBeInTheDocument();
    });
});

describe('medicine search: barcode scanner', () => {
    const code = '8901234567890';

    it('Enter on a scanned barcode looks it up at once and adds that exact product', async () => {
        const scanned = product('p5', 'DOLO 650 TAB', { barcode: code });
        (productsApi.search as jest.Mock).mockResolvedValue([scanned]);
        const box = setup([]);
        typeInto(box, code);
        fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' });

        await waitFor(() => expect(productsApi.search).toHaveBeenCalledWith(code, expect.anything(), 'billing'));
        // a product with one valid batch goes straight to the quantity step: the search box clears and locks
        await waitFor(() => expect(box.value).toBe(''));
    });

    it('an unknown barcode says so instead of adding something else', async () => {
        (productsApi.search as jest.Mock).mockResolvedValue([product('p6', 'SOME OTHER THING', { barcode: null })]);
        const box = setup([]);
        typeInto(box, code);
        fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' });
        expect(await screen.findByText(/No medicine has the barcode 8901234567890/)).toBeInTheDocument();
        expect(box.value).toBe(code);
    });

    it('Enter on a normal medicine name still picks the highlighted result (no barcode lookup)', async () => {
        const box = setup([original]);
        typeInto(box, 'losar');
        await screen.findByText('LOSAR 50MG TAB');
        fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' });
        await waitFor(() => expect(box.value).toBe(''));
        expect(productsApi.search).not.toHaveBeenCalled();
    });
});
