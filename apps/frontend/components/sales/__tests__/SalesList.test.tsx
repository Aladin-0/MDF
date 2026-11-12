import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesList from '../SalesList';

const push = jest.fn();
let mockParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => mockParams,
    usePathname: () => '/dashboard/sales',
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/apiClient', () => ({ getStoredToken: () => 'tok' }));
jest.mock('@/components/billing/InvoicePreviewModal', () => ({ InvoicePreviewModal: () => null }));
jest.mock('@/components/billing/PaymentBreakdownCell', () => ({ PaymentBreakdownCell: () => <span>pay</span> }));
jest.mock('@/store/billingStore', () => ({ useBillingStore: () => ({}) }));
jest.mock('@/store/authStore', () => ({ useAuthStore: (sel: any) => sel({ user: { role: 'admin' } }) }));

let mockData: any;
const calls: any[] = [];
jest.mock('@/hooks/useSales', () => ({
    useSalesList: (params: any) => { calls.push(params); return { data: mockData, isLoading: false }; },
    useSaleById: () => ({ data: undefined }),
}));

const inv = (n: number, over: any = {}) => ({
    id: `i${n}`, invoiceNo: `INV-000${n}`, invoiceDate: '2026-11-10T10:00:00', grandTotal: 100 * n, paymentMode: 'cash', saleType: 'RETAIL',
    cashPaid: 100 * n, upiPaid: 0, cardPaid: 0, creditGiven: 0, billedByName: 'Asha', items: [], itemsCount: 1, createdAt: '2026-11-10T10:00:00', ...over,
});

beforeEach(() => {
    jest.clearAllMocks(); calls.length = 0; mockParams = new URLSearchParams();
    mockData = {
        data: [inv(1, { isCancelled: true, isModified: true, revisionCount: 1 }), inv(2), inv(3)],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalRecords: 3 },
        analytics: { totalBills: 2, totalSales: 500, cashCollected: 500, upiCollected: 0, cardCollected: 0, creditGiven: 0 },
    };
});

describe('SalesList', () => {
    it('keeps a cancelled bill in the serial, marked Cancelled with its number and amount struck through', () => {
        render(<SalesList />);
        const row = document.getElementById('sale-row-i1')!;
        expect(within(row).getByText('INV-0001')).toHaveClass('line-through');
        expect(within(row).getByText('Cancelled')).toBeInTheDocument();
        expect(within(row).getByText(/100/)).toHaveClass('line-through');
        // all three numbers are there, in the order the server sent them
        expect(Array.from(document.querySelectorAll('tbody tr')).map((r) => r.id)).toEqual(['sale-row-i1', 'sale-row-i2', 'sale-row-i3']);
    });

    it('does not mark ordinary bills as cancelled', () => {
        render(<SalesList />);
        const row = document.getElementById('sale-row-i2')!;
        expect(within(row).queryByText('Cancelled')).not.toBeInTheDocument();
        expect(within(row).getByText('INV-0002')).not.toHaveClass('line-through');
    });

    it('still shows the Modified badge on a bill that is also cancelled', () => {
        render(<SalesList />);
        expect(within(document.getElementById('sale-row-i1')!).getByText('Modified')).toBeInTheDocument();
    });

    it('clicking a payment-mode card filters by it instead of crashing (it called a function that no longer existed)', async () => {
        render(<SalesList />);
        await userEvent.click(screen.getByTitle('Filter table by Cash'));
        expect(push).toHaveBeenCalledWith('/dashboard/sales?paymentMode=cash', { scroll: false });
    });

    it('and clicking the active card, or "Clear payment filter", clears it', async () => {
        mockParams = new URLSearchParams('paymentMode=upi');
        render(<SalesList />);
        await userEvent.click(screen.getByText('Clear payment filter'));
        expect(push).toHaveBeenCalledWith('/dashboard/sales', { scroll: false });
        push.mockClear();
        await userEvent.click(screen.getByTitle('Clear UPI filter'));
        expect(push).toHaveBeenCalledWith('/dashboard/sales', { scroll: false });
    });
});
