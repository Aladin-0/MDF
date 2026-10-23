import { useBillingStore } from '../../store/billingStore';
import { CartItem, DraftBill } from '../../types';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('Cart Repricing on setSaleType Toggle', () => {
    beforeEach(() => {
        useBillingStore.setState({
            drafts: {},
            activeDraftId: null,
        });
    });

    const createSampleDraft = (saleType: 'RETAIL' | 'WHOLESALE' = 'RETAIL'): DraftBill => {
        const item: CartItem = {
            batchId: 'b-101',
            productId: 'p-101',
            name: 'Paracetamol 500mg',
            packSize: 10,
            packUnit: 'strip',
            batchNo: 'B101',
            expiryDate: '2026-12-31',
            scheduleType: 'OTC',
            mrp: 100,
            ptr: 80,
            pts: 65,
            purchaseRate: 55,
            landingRate: 75,
            saleRate: 100,
            rate: 100,
            qtyStrips: 2,
            qtyLoose: 0,
            totalQty: 2,
            saleMode: 'strip',
            discountPct: 0,
            gstRate: 12,
            taxableAmount: 178.57,
            gstAmount: 21.43,
            totalAmount: 200,
        };

        return {
            id: 'draft-reprice-test',
            outletId: 'outlet-1',
            customer: null,
            doctor: null,
            cart: [item],
            payment: { method: 'cash', amount: 200 },
            extraDiscountPct: 0,
            documentMode: 'invoice',
            saleType,
            billingBasis: saleType === 'WHOLESALE' ? 'PTR' : 'MRP',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        } as unknown as DraftBill;
    };

    it('swaps item rate to PTS (65) and recalculates totalAmount when toggling to WHOLESALE', () => {
        const draft = createSampleDraft('RETAIL');
        useBillingStore.setState({
            drafts: { [draft.id]: draft },
            activeDraftId: draft.id,
        });

        // Toggle to WHOLESALE
        useBillingStore.getState().setSaleType(draft.id, 'WHOLESALE');

        const updatedDraft = useBillingStore.getState().drafts[draft.id];
        expect(updatedDraft.saleType).toBe('WHOLESALE');
        expect(updatedDraft.billingBasis).toBe('PTR');

        const repricedItem = updatedDraft.cart[0];
        // Swapped to PTS 65
        expect(repricedItem.rate).toBe(65);
        expect(repricedItem.saleRate).toBe(65);

        // Wholesale exclusive tax: taxable = 65 * 2 = 130, GST = 130 * 12% = 15.60, total = 145.60
        expect(repricedItem.taxableAmount).toBe(130);
        expect(repricedItem.gstAmount).toBe(15.6);
        expect(repricedItem.totalAmount).toBe(145.6);
    });

    it('swaps item rate back to MRP (100) and recalculates totalAmount when toggling back to RETAIL', () => {
        const draft = createSampleDraft('WHOLESALE');
        // Start in wholesale mode with wholesale pricing
        draft.cart[0].rate = 65;
        draft.cart[0].saleRate = 65;
        draft.cart[0].taxableAmount = 130;
        draft.cart[0].gstAmount = 15.6;
        draft.cart[0].totalAmount = 145.6;

        useBillingStore.setState({
            drafts: { [draft.id]: draft },
            activeDraftId: draft.id,
        });

        // Toggle to RETAIL
        useBillingStore.getState().setSaleType(draft.id, 'RETAIL');

        const updatedDraft = useBillingStore.getState().drafts[draft.id];
        expect(updatedDraft.saleType).toBe('RETAIL');
        expect(updatedDraft.billingBasis).toBe('MRP');

        const repricedItem = updatedDraft.cart[0];
        // Swapped to MRP 100
        expect(repricedItem.rate).toBe(100);
        expect(repricedItem.saleRate).toBe(100);

        // Retail inclusive tax: total = 100 * 2 = 200, taxable = 200 / 1.12 = 178.57, GST = 21.43
        expect(repricedItem.totalAmount).toBe(200);
        expect(repricedItem.taxableAmount).toBe(178.57);
        expect(repricedItem.gstAmount).toBe(21.43);
    });

    it('falls back to PTR when PTS is 0 or missing in WHOLESALE mode', () => {
        const draft = createSampleDraft('RETAIL');
        draft.cart[0].pts = 0; // No PTS, has PTR 80
        useBillingStore.setState({
            drafts: { [draft.id]: draft },
            activeDraftId: draft.id,
        });

        useBillingStore.getState().setSaleType(draft.id, 'WHOLESALE');

        const updatedDraft = useBillingStore.getState().drafts[draft.id];
        const repricedItem = updatedDraft.cart[0];
        // Falls back to PTR 80
        expect(repricedItem.rate).toBe(80);
        expect(repricedItem.taxableAmount).toBe(160); // 80 * 2
        expect(repricedItem.gstAmount).toBe(19.2);     // 160 * 12%
        expect(repricedItem.totalAmount).toBe(179.2);   // 160 + 19.2
    });

    it('preserves item discountPct and applies it to new wholesale base rate', () => {
        const draft = createSampleDraft('RETAIL');
        draft.cart[0].discountPct = 10; // 10% discount
        useBillingStore.setState({
            drafts: { [draft.id]: draft },
            activeDraftId: draft.id,
        });

        useBillingStore.getState().setSaleType(draft.id, 'WHOLESALE');

        const updatedDraft = useBillingStore.getState().drafts[draft.id];
        const repricedItem = updatedDraft.cart[0];
        // PTS is 65, with 10% discount -> rate is 58.50
        expect(repricedItem.rate).toBe(58.5);
        expect(repricedItem.discountPct).toBe(10);
        // Taxable: 58.50 * 2 = 117, GST = 117 * 12% = 14.04, total = 131.04
        expect(repricedItem.taxableAmount).toBe(117);
        expect(repricedItem.gstAmount).toBe(14.04);
        expect(repricedItem.totalAmount).toBe(131.04);
    });
});
