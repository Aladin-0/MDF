import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditProductModal } from '../EditProductModal';
import { productsApi } from '@/lib/apiClient';
import { DRUG_TYPE_OPTIONS } from '@/constants/productBehavior';

jest.mock('@/lib/apiClient', () => ({
    productsApi: { update: jest.fn() },
    API_URL: 'http://test',
    getHeaders: () => ({}),
}));
jest.mock('@/hooks/usePurchases', () => ({ useDistributorList: () => ({ data: [] }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/hooks/useMagicSubmit', () => ({ useMagicSubmit: () => undefined }));
jest.mock('@/store/authStore', () => ({ useAuthStore: (sel: any) => sel({ outlet: { id: 'o1' } }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));

// ENERZAL ZERO ORANGE as it is in stock: an energy drink bought at GST 40%, typed as "allopathy", salt "."
const enerzal = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'ENERZAL ZERO ORANGE', composition: '.', manufacturer: 'FDC PHARMA LTD', category: '', drugType: 'allopathy',
    scheduleType: 'OTC', hsnCode: '2202', gstRate: 40, mrp: 81, isFridge: false, isDiscontinued: false,
    packSize: 1, packUnit: 'Piece', packType: 'piece', ...over,
}) as any;

const update = productsApi.update as jest.Mock;

describe('Edit Product: every fact on the product page can be changed', () => {
    beforeAll(() => {
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
        (window as any).HTMLElement.prototype.releasePointerCapture = jest.fn();
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    });
    beforeEach(() => { update.mockReset(); update.mockResolvedValue({ name: 'ENERZAL ZERO ORANGE' }); });

    it('shows a 40% rate as 40%, not an empty box, and offers it', async () => {
        render(<EditProductModal product={enerzal()} open onOpenChange={() => {}} />);
        await userEvent.click(screen.getByRole('tab', { name: 'Compliance' }));
        const gst = await screen.findByRole('combobox', { name: 'GST Rate' });
        expect(gst).toHaveTextContent('40%');
        await userEvent.click(gst);
        const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
        expect(options).toEqual(['0%', '5%', '12%', '18%', '28%', '40%']);
    });

    it('keeps an unusual rate a product already has in the list', async () => {
        render(<EditProductModal product={enerzal({ gstRate: 3 })} open onOpenChange={() => {}} />);
        await userEvent.click(screen.getByRole('tab', { name: 'Compliance' }));
        expect(await screen.findByRole('combobox', { name: 'GST Rate' })).toHaveTextContent('3%');
    });

    it('has a Type field with exactly the types the server accepts', async () => {
        render(<EditProductModal product={enerzal()} open onOpenChange={() => {}} />);
        const type = await screen.findByRole('combobox', { name: 'Type' });
        expect(type).toHaveTextContent('Allopathy');
        await userEvent.click(type);
        const listbox = await screen.findByRole('listbox');
        expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(DRUG_TYPE_OPTIONS.map((o) => o.label));
    });

    it('shows a product with no type on record as Allopathy instead of an empty box', async () => {
        render(<EditProductModal product={enerzal({ drugType: '' })} open onOpenChange={() => {}} />);
        expect(await screen.findByRole('combobox', { name: 'Type' })).toHaveTextContent('Allopathy');
    });

    it('saves a new salt and type on a 40% product, sending its rate unchanged', async () => {
        const onOpenChange = jest.fn();
        render(<EditProductModal product={enerzal()} open onOpenChange={onOpenChange} />);
        await userEvent.click(await screen.findByRole('combobox', { name: 'Type' }));
        await userEvent.click(await screen.findByRole('option', { name: 'General / FMCG' }));
        const salt = screen.getByPlaceholderText('e.g. Paracetamol IP 500mg');
        await userEvent.clear(salt);
        await userEvent.type(salt, 'Electrolytes');
        await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        expect(update.mock.calls[0][0]).toBe('p1');
        expect(update.mock.calls[0][1]).toMatchObject({ composition: 'Electrolytes', drugType: 'general', gstRate: 40, hsnCode: '2202', manufacturer: 'FDC PHARMA LTD' });
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
});
