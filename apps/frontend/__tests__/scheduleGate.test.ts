import { useBillingStore } from '../store/billingStore';

jest.mock('uuid', () => ({ v4: () => 'id' }));

const line = (scheduleType: string, i = 0): any => ({
    batchId: `b${i}`, productId: `p${i}`, name: `Drug ${scheduleType}`, mrp: 100, rate: 100, saleRate: 100, qtyStrips: 1, qtyLoose: 0, totalQty: 1,
    packSize: 10, gstRate: 12, taxableAmount: 89.29, gstAmount: 10.71, totalAmount: 100, scheduleType, discountPct: 0,
});

function draftWith(scheduleType: string) {
    const store = useBillingStore.getState();
    const id = store.createDraft();
    store.addToCart(id, line(scheduleType));
    return id;
}

describe('Schedule G/H need doctor and patient details on the screen, as the server requires', () => {
    it.each(['G', 'H', 'H1', 'X', 'C', 'Narcotic'])('%s makes the bill need details', (s) => {
        const id = draftWith(s);
        expect(useBillingStore.getState().hasScheduleHItems(id)).toBe(true);
        expect(useBillingStore.getState().getDraftTotals(id).requiresDoctorDetails).toBe(true);
    });

    it.each(['OTC', 'Ayurvedic', 'Surgical'])('%s does not', (s) => {
        const id = draftWith(s);
        expect(useBillingStore.getState().hasScheduleHItems(id)).toBe(false);
    });
});
