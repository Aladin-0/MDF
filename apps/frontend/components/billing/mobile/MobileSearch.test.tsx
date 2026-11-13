import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileSearch } from './MobileSearch';
import { useBillingStore } from '../../../store/billingStore';
import { useProductSearch } from '@/hooks/useProductSearch';
import { usePermissions } from '@/hooks/usePermissions';
import { productsApi } from '@/lib/apiClient';
import { poApi } from '@/lib/poApi';

jest.mock('../../../store/billingStore', () => ({ useBillingStore: jest.fn() }));
jest.mock('@/hooks/useProductSearch', () => ({ useProductSearch: jest.fn() }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: jest.fn() }));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));
jest.mock('@/lib/poApi', () => ({ poApi: { shortbookAdd: jest.fn() } }));
jest.mock('@/lib/apiClient', () => {
    const actual = jest.requireActual('@/lib/apiClient');
    return { ...actual, productsApi: { ...actual.productsApi, search: jest.fn(), substitutes: jest.fn() } };
});

const batch = (id: string, extra: any = {}) => ({
    id, batchNo: `B-${id}`, expiryDate: '2099-12-31', mrp: 100, ptr: 80, pts: 70, purchaseRate: 50,
    qtyStrips: 10, qtyLoose: 0, packSize: 10, packUnit: 'tablet', packType: 'strip', ...extra,
});
const product = (id: string, name: string, extra: any = {}): any => ({
    id, name, composition: 'LOSARTAN POTASSIUM', manufacturer: 'Mfg', gstRate: 12, packSize: 10, packUnit: 'tablet', packType: 'strip',
    scheduleType: 'OTC', mrp: 100, totalStock: 10, nearestExpiry: '2099-12-31', isLowStock: false, hasStock: true, batches: [batch(id)], ...extra,
});

const original = product('p1', 'LOSAR 50MG TAB');
const sub = product('p2', 'LOSANORM 50MG TAB', { substitute: { sameStrength: true, sameForm: true } });
const subOther = product('p3', 'LOSAR 25MG TAB', { substitute: { sameStrength: false, sameForm: false } });
const outOfStock = product('p4', 'LOSACAR 50MG TAB', { totalStock: 0, hasStock: false, batches: [] });

let addToCart: jest.Mock;
function setup({ results = [original] as any[], perms = ['create_bills'] as string[], open = true, onClose = jest.fn(), cart = [] as any[] } = {}) {
    addToCart = jest.fn();
    (useBillingStore as unknown as jest.Mock).mockReturnValue({
        activeDraftId: 'draft-1',
        drafts: { 'draft-1': { cart, saleType: 'RETAIL' } },
        addToCart,
    });
    (useProductSearch as jest.Mock).mockReturnValue({ data: results, isFetching: false });
    (usePermissions as jest.Mock).mockReturnValue({ hasPermission: (p: string) => perms.includes(p) });
    render(<MobileSearch open={open} onClose={onClose} />);
    return { onClose, input: () => screen.getByRole('textbox', { name: 'Search medicine' }) as HTMLInputElement };
}

beforeEach(() => {
    jest.clearAllMocks();
    (productsApi.substitutes as jest.Mock).mockResolvedValue({ products: [sub, subOther] });
    (productsApi.search as jest.Mock).mockResolvedValue([]);
    (poApi.shortbookAdd as jest.Mock).mockResolvedValue({});
});

describe('MobileSearch', () => {
    it('renders nothing while closed', () => {
        setup({ open: false });
        expect(screen.queryByTestId('mobile-search-input')).not.toBeInTheDocument();
    });

    it('focuses the search box when opened and asks for at least 2 letters', async () => {
        const { input } = setup();
        await waitFor(() => expect(input()).toHaveFocus());
        expect(screen.getByText(/Type at least 2 letters/)).toBeInTheDocument();
        expect(screen.queryByTestId('search-result-row')).not.toBeInTheDocument();
    });

    it('typing shows result rows; the text goes to the search hook; clear empties it', () => {
        const { input } = setup({ results: [original, product('p9', 'LOSARTAN OTHER')] });
        fireEvent.change(input(), { target: { value: 'losar' } });
        expect(useProductSearch).toHaveBeenLastCalledWith('losar', 'billing');
        expect(screen.getAllByTestId('search-result-row')).toHaveLength(2);
        expect(screen.getByText('LOSAR 50MG TAB')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('clear-search'));
        expect(input().value).toBe('');
    });

    it('no results shows an empty message', () => {
        const { input } = setup({ results: [] });
        fireEvent.change(input(), { target: { value: 'zzzz' } });
        expect(screen.getByTestId('search-empty')).toHaveTextContent('No medicines found for "zzzz"');
    });

    it('tip chips insert the C, and L+ prefixes', () => {
        const { input } = setup();
        fireEvent.click(screen.getByTestId('tip-salt'));
        expect(input().value).toBe('C,');
        fireEvent.change(input(), { target: { value: 'losar' } });
        fireEvent.click(screen.getByTestId('tip-price'));
        expect(input().value).toBe('losar+');
    });

    it('substitutes open for that product with the header, badges and a Back chip that returns to the results', async () => {
        const { input } = setup({ results: [original, product('p9', 'LOSARTAN OTHER')] });
        fireEvent.change(input(), { target: { value: 'losar' } });
        fireEvent.click(screen.getAllByTestId('show-substitutes')[0]);

        expect(await screen.findByText(/Substitutes for/)).toHaveTextContent('LOSAR 50MG TAB');
        expect(screen.getByText(/Substitutes for/)).toHaveTextContent('same salt: LOSARTAN POTASSIUM');
        expect(productsApi.substitutes).toHaveBeenCalledWith('p1', 'outlet-1', 'billing');
        expect(await screen.findByText('LOSANORM 50MG TAB')).toBeInTheDocument();
        expect(screen.getByText('Same strength')).toBeInTheDocument();
        expect(screen.getByText('Different strength')).toBeInTheDocument();
        expect(screen.getByText('Different form')).toBeInTheDocument();
        expect(screen.queryByText('LOSARTAN OTHER')).not.toBeInTheDocument();
        expect(screen.queryByTestId('show-substitutes')).not.toBeInTheDocument();      // no substitutes of substitutes

        fireEvent.click(screen.getByTestId('close-substitutes'));
        await waitFor(() => expect(screen.queryByText(/Substitutes for/)).not.toBeInTheDocument());
        expect(screen.getByText('LOSARTAN OTHER')).toBeInTheDocument();
    });

    it('Enter on a barcode-looking text looks the barcode up and opens the Add sheet', async () => {
        (productsApi.search as jest.Mock).mockResolvedValue([{ ...original, barcode: '8901234567890' }]);
        const { input } = setup();
        fireEvent.change(input(), { target: { value: '8901234567890' } });
        fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });
        await waitFor(() => expect(productsApi.search).toHaveBeenCalledWith('8901234567890', 'outlet-1', 'billing'));
        expect(await screen.findByTestId('add-to-bill')).toBeInTheDocument();
        expect(screen.getAllByText('LOSAR 50MG TAB').length).toBeGreaterThan(0);
    });

    it('Enter on ordinary text does not look anything up', () => {
        const { input } = setup();
        fireEvent.change(input(), { target: { value: 'dolo' } });
        fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });
        expect(productsApi.search).not.toHaveBeenCalled();
    });

    it('an unknown barcode says so and offers Search by name', async () => {
        const { input } = setup();
        fireEvent.change(input(), { target: { value: '8901234567890' } });
        fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });
        expect(await screen.findByTestId('search-notice')).toHaveTextContent('No medicine has the barcode 8901234567890');
        fireEvent.click(screen.getByTestId('search-by-name'));
        expect(screen.queryByTestId('search-notice')).not.toBeInTheDocument();
        expect(input().value).toBe('');
    });

    it('Add to bill puts the line in the cart and goes straight back to the bill (the search closes)', async () => {
        const { input, onClose } = setup();
        fireEvent.change(input(), { target: { value: 'losar' } });
        fireEvent.click(screen.getByTestId('add-product'));

        fireEvent.change(await screen.findByTestId('quick-qty-strips'), { target: { value: '2' } });
        fireEvent.click(screen.getByTestId('add-to-bill'));

        expect(addToCart).toHaveBeenCalledTimes(1);
        expect(addToCart.mock.calls[0][0]).toBe('draft-1');
        expect(addToCart.mock.calls[0][1]).toMatchObject({ productId: 'p1', qtyStrips: 2 });
        expect(onClose).toHaveBeenCalledTimes(1);                                   // no extra "Done" tap
    });

    it('a medicine already in the bill is tagged "In bill" and its button says Add more; others say Add', () => {
        const other = product('p9', 'LOSARTAN OTHER');
        setup({ results: [original, other], cart: [{ batchId: 'b-p1', productId: 'p1', qtyStrips: 2, qtyLoose: 0, packType: 'strip' }] });
        fireEvent.change(screen.getByRole('textbox', { name: 'Search medicine' }), { target: { value: 'losar' } });
        const rows = screen.getAllByTestId('search-result-row');
        expect(rows[0]).toHaveTextContent('In bill · 2 strips');
        expect(rows[0].querySelector('[data-testid="add-product"]')).toHaveTextContent('Add more');
        expect(rows[1]).not.toHaveTextContent('In bill');
        expect(rows[1].querySelector('[data-testid="add-product"]')).toHaveTextContent(/^Add$/);
    });

    it('Done and the back arrow both close the screen', () => {
        const { onClose } = setup();
        fireEvent.click(screen.getByTestId('search-done'));
        fireEvent.click(screen.getByLabelText('Back to bill'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('the Scan button opens the camera scanner (unsupported browsers get the message)', async () => {
        setup();
        fireEvent.click(screen.getByTestId('scan-button'));
        expect(await screen.findByTestId('scanner-message')).toHaveTextContent('Camera scanning is not supported on this browser');
        fireEvent.click(screen.getByTestId('enter-manually'));
        await waitFor(() => expect(screen.queryByTestId('scanner-message')).not.toBeInTheDocument());
        expect(screen.getByTestId('mobile-search-input')).toBeInTheDocument();
    });

    describe('out of stock', () => {
        it('shows Add to Shortbook with the permission, and posts the product to the Shortbook', async () => {
            const { input } = setup({ results: [outOfStock], perms: ['create_bills'] });
            fireEvent.change(input(), { target: { value: 'losac' } });
            expect(screen.queryByTestId('add-product')).not.toBeInTheDocument();
            fireEvent.click(screen.getByTestId('add-to-shortbook'));
            await waitFor(() => expect(poApi.shortbookAdd).toHaveBeenCalledWith('outlet-1', { productId: 'p4', qty: 1, source: 'billing' }));
            expect(await screen.findByText('On the Shortbook')).toBeInTheDocument();
        });

        it('create_purchases alone is enough', () => {
            const { input } = setup({ results: [outOfStock], perms: ['create_purchases'] });
            fireEvent.change(input(), { target: { value: 'losac' } });
            expect(screen.getByTestId('add-to-shortbook')).toBeInTheDocument();
        });

        it('has no Shortbook button without either permission', () => {
            const { input } = setup({ results: [outOfStock], perms: [] });
            fireEvent.change(input(), { target: { value: 'losac' } });
            expect(screen.getByTestId('no-valid-stock')).toBeInTheDocument();
            expect(screen.queryByTestId('add-to-shortbook')).not.toBeInTheDocument();
        });

        it('a scanned out-of-stock product shows the message with Add to Shortbook only when permitted', async () => {
            (productsApi.search as jest.Mock).mockResolvedValue([{ ...outOfStock, barcode: '8901234567890' }]);
            const { input } = setup({ results: [], perms: ['create_bills'] });
            fireEvent.change(input(), { target: { value: '8901234567890' } });
            fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });
            expect(await screen.findByTestId('search-notice')).toHaveTextContent('No stock available for LOSACAR 50MG TAB');
            expect(screen.getByTestId('add-to-shortbook')).toBeInTheDocument();
        });
    });
});
