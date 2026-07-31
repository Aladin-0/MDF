import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainInvoiceWorkspace } from '../../components/billing-v3/MainInvoiceWorkspace';
import { RightBillingRail } from '../../components/billing-v3/RightBillingRail';
import { useBillingStore } from '../../store/billingStore';
import FullScreenBillingPage from '../../app/billing/page';

// Do NOT mock the store. We'll use the real store and setState.

jest.mock('uuid', () => ({ v4: () => 'test-id' }));

jest.mock('../../hooks/useProductSearch', () => ({
    useProductSearch: jest.fn(() => ({ data: [], isFetching: false }))
}));

jest.mock('../../hooks/useLoadDrafts', () => ({
    useLoadDrafts: jest.fn(() => true)
}));

jest.mock('../../components/billing/StaffPinEntry', () => ({ StaffPinEntry: () => <div data-testid="StaffPinEntry" /> }));
jest.mock('../../components/billing/BillSuccessScreen', () => ({ BillSuccessScreen: () => <div data-testid="BillSuccessScreen" /> }));

jest.mock('@tanstack/react-query', () => ({
    useQueryClient: jest.fn(() => ({})),
    useQuery: jest.fn(() => ({ data: null, isLoading: false }))
}));

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useParams: () => ({ id: '1' }),
    usePathname: () => '/',
}));

const mockCartItem = {
    batchId: 'batch-1',
    name: 'Paracetamol',
    purchaseRate: 80,
    saleRate: 100,
    mrp: 120, // Added to prevent undefined.toFixed()
    totalAmount: 100, // Added to prevent undefined.toFixed()
    landingRate: 85, // Provided via backend fallback
    totalQty: 1,
};

const mockDraft = {
    id: 'draft-1', // Added for transaction strip slice()
    cart: [mockCartItem],
};

const mockTotals = {
    subtotal: 100,
    totalMargin: 15, // 100 - 85
    totalMarginPct: 15,
    totalGrossProfit: 15,
    discountAmount: 0,
    extraDiscountAmount: 0,
    cgst: 0,
    sgst: 0,
    roundOff: 0,
    grandTotal: 100,
};

describe('Margin Visibility Features', () => {
    beforeEach(() => {
        // Reset the real store state before each test
        useBillingStore.setState({
            isPinVerified: true,
            activeDraftId: 'draft-1',
            drafts: { 'draft-1': mockDraft as any },
            showMarginInfo: true,
            activeStaff: { role: 'admin' } as any,
        });

        // Mock methods that aren't purely state
        useBillingStore.setState({
            getDraftTotals: jest.fn(() => mockTotals as any),
            hasScheduleHItems: jest.fn(() => false) as any,
        });

        // Spy on toggleMarginInfo
        jest.spyOn(useBillingStore.getState(), 'toggleMarginInfo');
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Row-level margin badge', () => {
        it('renders margin badge when showMarginInfo is true and role is admin', () => {
            render(<MainInvoiceWorkspace />);
            expect(screen.getByText(/Base ₹85/)).toBeInTheDocument();
            expect(screen.getByText(/₹15/)).toBeInTheDocument();
            expect(screen.getByText(/\(15%\)/)).toBeInTheDocument();
        });

        it('does not render margin badge when role is cashier', () => {
            useBillingStore.setState({ activeStaff: { role: 'cashier' } as any });
            render(<MainInvoiceWorkspace />);
            expect(screen.queryByText(/Base ₹85/)).not.toBeInTheDocument();
        });

        it('does not render margin badge when showMarginInfo is false', () => {
            useBillingStore.setState({ showMarginInfo: false });
            render(<MainInvoiceWorkspace />);
            expect(screen.queryByText(/Base ₹85/)).not.toBeInTheDocument();
        });
    });

    describe('Right-rail totals rendering', () => {
        it('renders total margin when showMarginInfo is true and role is admin', () => {
            render(<RightBillingRail />);
            expect(screen.getByText(/Total Margin/)).toBeInTheDocument();
            expect(screen.getAllByText(/₹ 15.00/).length).toBeGreaterThan(0);
            expect(screen.getByText(/Gross Profit/)).toBeInTheDocument();
        });

        it('does not render total margin when role is cashier', () => {
            useBillingStore.setState({ activeStaff: { role: 'cashier' } as any });
            render(<RightBillingRail />);
            expect(screen.queryByText(/Total Margin/)).not.toBeInTheDocument();
        });

        it('does not render total margin when showMarginInfo is false', () => {
            useBillingStore.setState({ showMarginInfo: false });
            render(<RightBillingRail />);
            expect(screen.queryByText(/Total Margin/)).not.toBeInTheDocument();
        });
    });

    describe('Ctrl+Shift+M shortcut', () => {
        it('toggles margin info on Ctrl+Shift+M', () => {
            render(<FullScreenBillingPage />);
            
            // Fire keydown
            fireEvent.keyDown(window, { key: 'm', code: 'KeyM', ctrlKey: true, shiftKey: true });
            
            expect(useBillingStore.getState().toggleMarginInfo).toHaveBeenCalledTimes(1);
        });

        it('does not toggle when typing in an input field', () => {
            render(
                <div>
                    <FullScreenBillingPage />
                    <input data-testid="test-input" />
                </div>
            );
            
            const input = screen.getByTestId('test-input');
            input.focus();
            
            // Fire keydown while input is focused
            fireEvent.keyDown(window, { key: 'm', code: 'KeyM', ctrlKey: true, shiftKey: true });
            
            expect(useBillingStore.getState().toggleMarginInfo).not.toHaveBeenCalled();
        });
    });
});
