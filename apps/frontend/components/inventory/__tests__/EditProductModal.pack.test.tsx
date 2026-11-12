import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { EditProductModal } from '../EditProductModal';

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

const product = (over: Record<string, unknown>) => ({
    id: 'p1', name: 'Test', composition: '', manufacturer: '', category: '', drugType: 'allopathy',
    scheduleType: 'OTC', hsnCode: '3004', gstRate: 12, mrp: 100, isFridge: false, isDiscontinued: false,
    packSize: 10, packUnit: 'tablet', packType: 'strip', ...over,
}) as any;

const packSizeInput = () => screen.getByPlaceholderText('e.g. 10') as HTMLInputElement;

describe('EditProductModal: opening a product must not change its pack details', () => {
    beforeAll(() => {
        // Radix needs these in jsdom
        (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        (window as any).HTMLElement.prototype.scrollIntoView = jest.fn();
        (window as any).HTMLElement.prototype.hasPointerCapture = jest.fn();
    });

    it('keeps a bottle of 100 at 100 (it used to be reset to size 1 / Piece just by opening it)', async () => {
        render(<EditProductModal product={product({ packType: 'bottle', packSize: 100, packUnit: 'ml' })} open onOpenChange={() => {}} />);
        await waitFor(() => expect(packSizeInput().value).toBe('100'));
        // give any (buggy) effect a chance to run before asserting nothing moved
        await new Promise((r) => setTimeout(r, 50));
        expect(packSizeInput().value).toBe('100');
        expect(screen.getAllByText('ml').length).toBeGreaterThan(0);
    });

    it('keeps a blister of 10 at 10 (blister was treated like a bottle)', async () => {
        render(<EditProductModal product={product({ packType: 'blister', packSize: 10, packUnit: 'capsule' })} open onOpenChange={() => {}} />);
        await waitFor(() => expect(packSizeInput().value).toBe('10'));
        await new Promise((r) => setTimeout(r, 50));
        expect(packSizeInput().value).toBe('10');
        expect(screen.getAllByText('capsule').length).toBeGreaterThan(0); // not replaced by "Tablet"
    });
});
