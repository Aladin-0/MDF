import { renderHook, waitFor } from '@testing-library/react';
import { useLoadDrafts } from '../useLoadDrafts';
import { useBillingStore } from '../../store/billingStore';
import { useAuthStore } from '../../store/authStore';

// Mock zustand stores
jest.mock('../../store/billingStore', () => ({
    useBillingStore: Object.assign(
        jest.fn(),
        {
            getState: jest.fn(),
        }
    )
}));

jest.mock('../../store/authStore', () => ({
    useAuthStore: {
        getState: jest.fn(),
    }
}));

// Mock the API client dynamic import
jest.mock('@/lib/apiClient', () => ({
    getHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
    assertOk: jest.fn(),
    API_URL: 'http://test-api'
}), { virtual: true });

describe('useLoadDrafts regression test', () => {
    let mockFetch: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch = jest.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should fetch server drafts even if currentDrafts has keys (no short-circuit lockout)', async () => {
        // Setup initial store state with an existing draft (simulate pre-fill or active draft)
        const mockCreateDraft = jest.fn();
        const mockSetDrafts = jest.fn();

        const mockBillingState = {
            drafts: {
                'local-123': { id: 'local-123', cart: [], payment: {} }
            },
            activeDraftId: 'local-123',
            activeStaff: { id: 'staff-1', name: 'Test Staff' },
            setDrafts: mockSetDrafts,
            createDraft: mockCreateDraft,
        };

        // Mock useBillingStore(selector) for activeStaff
        (useBillingStore as unknown as jest.Mock).mockImplementation((selector: any) => {
            if (selector) return selector(mockBillingState);
            return mockBillingState; // for non-selector usage (e.g. destructuring)
        });

        (useBillingStore.getState as jest.Mock).mockReturnValue(mockBillingState);

        (useAuthStore.getState as jest.Mock).mockReturnValue({
            outlet: { id: 'outlet-1' }
        });

        // Mock fetch response for server drafts
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                {
                    id: 'server-draft-1',
                    items: [{ batch: 'b1', qty_strips: 1, qty_loose: 0, product_name: 'Med 1' }]
                }
            ])
        });

        const { result } = renderHook(() => useLoadDrafts());

        // Wait for the hook to set isLoaded to true
        await waitFor(() => {
            expect(result.current).toBe(true);
        });

        // Assert that fetch was called despite currentDrafts having keys
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/sales/drafts/?outletId=outlet-1'),
            expect.any(Object)
        );

        // Assert that setDrafts was called merging the existing and new drafts
        expect(mockSetDrafts).toHaveBeenCalledWith(
            expect.objectContaining({
                'local-123': expect.any(Object),
                'server-draft-1': expect.any(Object)
            }),
            'local-123' // firstId should be the current active ID if we have one
        );
    });
});
