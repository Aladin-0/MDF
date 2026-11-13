import "@testing-library/jest-dom";
import React from 'react';
import { render, screen } from '@testing-library/react';
import { InlineRowEditor } from './InlineRowEditor';

jest.mock('@tanstack/react-query', () => ({
    useQueryClient: jest.fn(() => ({})),
    useQuery: jest.fn(() => ({ data: undefined, isLoading: false })),
}));
jest.mock('@/hooks/useOutletId', () => ({ useOutletId: () => 'outlet-1' }));

const item: any = {
    batchId: 'b1', productId: 'p1', name: 'DOLO 650', composition: 'PARACETAMOL', batchNo: 'B1', expiryDate: '2099-12-31',
    mrp: 100, ptr: 80, pts: 70, saleRate: 100, rate: 100, purchaseRate: 60, landingRate: 62,
    packSize: 10, packUnit: 'tablet', packType: 'strip', qtyStrips: 2, qtyLoose: 0, totalQty: 2, discountPct: 0, gstRate: 12,
    taxableAmount: 178, gstAmount: 22, totalAmount: 200, saleMode: 'strip', scheduleType: 'OTC',
};

const props = { item, onSave: jest.fn(), onCancel: jest.fn(), onRemove: jest.fn() };

describe('line editor: cost and margin are not for every role', () => {
    it('hides Est. Cost and Margin by default (a cashier must never see them)', () => {
        render(<InlineRowEditor {...props} />);
        expect(screen.queryByText('Est. Cost')).not.toBeInTheDocument();
        expect(screen.queryByText('Margin')).not.toBeInTheDocument();
        expect(screen.getByText('Sell Amount')).toBeInTheDocument();      // the customer-facing amount is always there
    });

    it('shows them when the role may see margins', () => {
        render(<InlineRowEditor {...props} showMargin />);
        expect(screen.getByText('Est. Cost')).toBeInTheDocument();
        expect(screen.getByText('Margin')).toBeInTheDocument();
    });
});
