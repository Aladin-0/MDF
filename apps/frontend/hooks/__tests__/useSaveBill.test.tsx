import { renderHook } from '@testing-library/react';
import { useSaveBill } from '../useSaveBill';
import { useBillingStore } from '@/store/billingStore';
import { useAuthStore } from '@/store/authStore';
import { salesApi } from '@/lib/apiClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('uuid', () => ({ v4: () => 'uuid-1234' }));
jest.mock('@/store/billingStore');
jest.mock('@/store/authStore');
jest.mock('@/store/settingsStore', () => ({
    useSettingsStore: { getState: () => ({ selectedOutletId: 'outlet-1' }) }
}));
jest.mock('@/lib/apiClient', () => ({
    salesApi: {
        create: jest.fn(),
    }
}));

describe('useSaveBill', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        jest.clearAllMocks();
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } }
        });
        (useAuthStore.getState as jest.Mock).mockReturnValue({
            outlet: { id: 'outlet-1' }
        });
    });

    it('throws error if customer is missing for Sale Invoices', async () => {
        const mockDraft = {
            id: 'local-123',
            documentMode: 'invoice',
            cart: [{ batchId: 'b1', rate: 10, totalQty: 1, gstRate: 0, totalAmount: 10 }],
            customerLedger: null,
            customer: null,
            payment: { method: 'cash', amount: 10 }
        };

        const mockGetDraftTotals = jest.fn().mockReturnValue({
            subtotal: 10, discountAmount: 0, taxableAmount: 10, cgstAmount: 0, sgstAmount: 0, roundOff: 0, grandTotal: 10
        });

        (useBillingStore.getState as jest.Mock).mockReturnValue({
            activeDraftId: 'local-123',
            drafts: { 'local-123': mockDraft },
            getDraftTotals: mockGetDraftTotals,
            activeStaff: { id: 'staff-1' }
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(() => useSaveBill(), { wrapper });

        await expect(result.current.saveBill()).rejects.toThrow("Customer selection is mandatory for Sale Invoices.");
    });

    it('serializes invoiceDate properly when set', async () => {
        const mockDraft = {
            id: 'local-124',
            documentMode: 'invoice',
            invoiceDate: '2026-07-18T16:36',
            cart: [{ batchId: 'b1', rate: 10, totalQty: 1, gstRate: 0, totalAmount: 10 }],
            customerLedger: { id: 'ledger-1', isMock: false },
            payment: { method: 'cash', amount: 10 }
        };

        const mockGetDraftTotals = jest.fn().mockReturnValue({
            subtotal: 10, discountAmount: 0, taxableAmount: 10, cgstAmount: 0, sgstAmount: 0, roundOff: 0, grandTotal: 10
        });

        (useBillingStore.getState as jest.Mock).mockReturnValue({
            activeDraftId: 'local-124',
            drafts: { 'local-124': mockDraft },
            getDraftTotals: mockGetDraftTotals,
            activeStaff: { id: 'staff-1' },
            closeDraft: jest.fn(),
            incrementBillsToday: jest.fn(),
            setLastInvoice: jest.fn()
        });

        (salesApi.create as jest.Mock).mockResolvedValue({ id: 'inv-123' });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(() => useSaveBill(), { wrapper });
        await result.current.saveBill();

        expect(salesApi.create).toHaveBeenCalled();
        const payload = (salesApi.create as jest.Mock).mock.calls[0][0];
        
        // Ensure invoiceDate is included and is in ISO string format (contains 'Z' or offset)
        expect(payload.invoiceDate).toBeDefined();
        expect(payload.invoiceDate).toMatch(/2026-07-18T\d{2}:\d{2}:\d{2}\.000Z/); // Checks standard JS UTC ISO string format
    });
});
